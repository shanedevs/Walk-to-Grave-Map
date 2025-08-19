// Real-time GPS-based Cemetery Navigation System
// Handles on-site navigation with proper GPS tracking and proximity detection

export class RealTimeGPSNavigation {
  constructor(options = {}) {
    this.options = {
      // GPS tracking settings
      enableHighAccuracy: true,
      maximumAge: 1000, // 1 second
      timeout: 5000,
      
      // Proximity thresholds (in meters)
      arrivalThreshold: 5, // Consider arrived when within 5m
      waypointThreshold: 10, // Next waypoint when within 10m
      offRouteThreshold: 20, // Consider off-route when >20m from path
      
      // Real-time update intervals
      positionUpdateInterval: 1000, // Update every 1 second
      navigationUpdateInterval: 500, // Navigation updates every 0.5 seconds
      
      // Progress tracking
      minProgressDistance: 2, // Minimum movement to count as progress (meters)
      stationaryTimeout: 30000, // Consider stationary after 30 seconds
      
      ...options
    };
    
    this.isNavigating = false;
    this.currentRoute = null;
    this.currentPosition = null;
    this.currentWaypointIndex = 0;
    this.navigationHistory = [];
    this.watchId = null;
    
    // Real-time tracking state
    this.lastProgressTime = null;
    this.totalDistanceTraveled = 0;
    this.estimatedTimeRemaining = 0;
    
    // Event callbacks
    this.onLocationUpdate = null;
    this.onNavigationUpdate = null;
    this.onWaypointReached = null;
    this.onDestinationReached = null;
    this.onOffRoute = null;
    this.onNavigationError = null;
    
    this.pathfinder = null; // Will be set externally
  }

  // Initialize GPS navigation
  async startRealTimeNavigation(startCoords, endCoords, pathfinder) {
    try {
      console.log('🚀 Starting real-time GPS navigation...');
      
      this.pathfinder = pathfinder;
      
      // Check GPS permission and availability
      if (!navigator.geolocation) {
        throw new Error('GPS/Geolocation not supported on this device');
      }

      // Calculate initial route
      const startNode = pathfinder.findNearestNode(startCoords);
      const endNode = pathfinder.findNearestNode(endCoords);
      
      const routeResult = pathfinder.findShortestPath(startNode, endNode);
      
      if (!routeResult.success) {
        throw new Error('Could not calculate route to destination');
      }

      this.currentRoute = {
        ...routeResult,
        startCoords,
        endCoords,
        startTime: Date.now()
      };
      
      this.currentWaypointIndex = 0;
      this.isNavigating = true;
      this.navigationHistory = [];
      this.totalDistanceTraveled = 0;
      
      console.log(`✅ Route calculated: ${routeResult.distance.toFixed(1)}m, ${routeResult.path.length} waypoints`);
      
      // Start GPS tracking
      this.startGPSTracking();
      
      // Start navigation update loop
      this.startNavigationLoop();
      
      return {
        success: true,
        route: this.currentRoute,
        message: 'Real-time navigation started'
      };
      
    } catch (error) {
      console.error('❌ Navigation start failed:', error);
      this.handleNavigationError(error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Start continuous GPS tracking
  startGPSTracking() {
    const options = {
      enableHighAccuracy: this.options.enableHighAccuracy,
      maximumAge: this.options.maximumAge,
      timeout: this.options.timeout
    };

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handleLocationUpdate(position),
      (error) => this.handleLocationError(error),
      options
    );
    
    console.log('📍 GPS tracking started');
  }

  // Handle GPS location updates
  handleLocationUpdate(position) {
    const newPosition = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: Date.now(),
      coords: [position.coords.longitude, position.coords.latitude]
    };

    // Calculate movement since last position
    if (this.currentPosition) {
      const distanceMoved = this.calculateDistance(
        this.currentPosition.coords,
        newPosition.coords
      );
      
      // Only update if significant movement (reduces GPS noise)
      if (distanceMoved >= this.options.minProgressDistance) {
        this.totalDistanceTraveled += distanceMoved;
        this.lastProgressTime = Date.now();
        
        // Add to navigation history
        this.navigationHistory.push({
          position: newPosition,
          waypointIndex: this.currentWaypointIndex,
          timestamp: Date.now()
        });
        
        // Keep history manageable
        if (this.navigationHistory.length > 100) {
          this.navigationHistory.shift();
        }
      }
    }

    this.currentPosition = newPosition;
    
    // Trigger location update callback
    if (this.onLocationUpdate) {
      this.onLocationUpdate(newPosition);
    }
  }

  // Handle GPS errors
  handleLocationError(error) {
    console.error('📍 GPS Error:', error.message);
    
    const errorMessages = {
      1: 'GPS permission denied',
      2: 'GPS position unavailable', 
      3: 'GPS timeout'
    };
    
    this.handleNavigationError(new Error(errorMessages[error.code] || 'GPS error'));
  }

  // Main navigation update loop
  startNavigationLoop() {
    const updateInterval = setInterval(() => {
      if (!this.isNavigating || !this.currentPosition) {
        return;
      }

      this.updateNavigation();
      
    }, this.options.navigationUpdateInterval);

    // Store interval ID for cleanup
    this.navigationInterval = updateInterval;
  }

  // Update navigation state based on current position
  updateNavigation() {
    if (!this.currentRoute || !this.currentPosition) return;

    const currentWaypoint = this.currentRoute.path[this.currentWaypointIndex];
    const nextWaypoint = this.currentRoute.path[this.currentWaypointIndex + 1];
    
    if (!currentWaypoint) {
      this.completeNavigation();
      return;
    }

    // Calculate distance to current waypoint
    const distanceToWaypoint = this.calculateDistance(
      this.currentPosition.coords,
      currentWaypoint.coordinates
    );

    // Calculate distance to final destination
    const finalDestination = this.currentRoute.path[this.currentRoute.path.length - 1];
    const distanceToDestination = this.calculateDistance(
      this.currentPosition.coords,
      finalDestination.coordinates
    );

    // Check if reached final destination
    if (distanceToDestination <= this.options.arrivalThreshold) {
      this.reachDestination();
      return;
    }

    // Check if reached current waypoint
    if (distanceToWaypoint <= this.options.waypointThreshold) {
      this.reachWaypoint();
      return;
    }

    // Check if off route
    const isOffRoute = this.checkIfOffRoute();
    if (isOffRoute) {
      this.handleOffRoute();
      return;
    }

    // Calculate remaining time and distance
    this.updateProgressEstimates();

    // Prepare navigation update
    const navigationUpdate = {
      currentPosition: this.currentPosition,
      currentWaypoint,
      nextWaypoint,
      distanceToWaypoint: distanceToWaypoint,
      distanceToDestination: distanceToDestination,
      totalDistanceTraveled: this.totalDistanceTraveled,
      estimatedTimeRemaining: this.estimatedTimeRemaining,
      waypointIndex: this.currentWaypointIndex,
      totalWaypoints: this.currentRoute.path.length,
      bearing: nextWaypoint ? this.calculateBearing(
        this.currentPosition.coords,
        nextWaypoint.coordinates
      ) : null,
      instruction: this.generateInstruction(currentWaypoint, nextWaypoint, distanceToWaypoint)
    };

    // Trigger navigation update callback
    if (this.onNavigationUpdate) {
      this.onNavigationUpdate(navigationUpdate);
    }
  }

  // Check if user has gone off the planned route
  checkIfOffRoute() {
    if (!this.currentRoute || !this.currentPosition) return false;

    // Get current segment of the path
    const currentWaypoint = this.currentRoute.path[this.currentWaypointIndex];
    const nextWaypoint = this.currentRoute.path[this.currentWaypointIndex + 1];
    
    if (!currentWaypoint || !nextWaypoint) return false;

    // Calculate distance from current position to the line segment between waypoints
    const distanceToPath = this.calculateDistanceToLineSegment(
      this.currentPosition.coords,
      currentWaypoint.coordinates,
      nextWaypoint.coordinates
    );

    return distanceToPath > this.options.offRouteThreshold;
  }

  // Handle reaching a waypoint
  reachWaypoint() {
    if (this.currentWaypointIndex < this.currentRoute.path.length - 1) {
      this.currentWaypointIndex++;
      
      const waypoint = this.currentRoute.path[this.currentWaypointIndex];
      console.log(`🎯 Reached waypoint: ${waypoint.name || waypoint.nodeId}`);
      
      if (this.onWaypointReached) {
        this.onWaypointReached({
          waypoint,
          waypointIndex: this.currentWaypointIndex,
          totalWaypoints: this.currentRoute.path.length
        });
      }
    }
  }

  // Handle reaching the final destination
  reachDestination() {
    console.log('🏁 Destination reached!');
    
    this.isNavigating = false;
    
    if (this.onDestinationReached) {
      this.onDestinationReached({
        destination: this.currentRoute.path[this.currentRoute.path.length - 1],
        totalDistanceTraveled: this.totalDistanceTraveled,
        totalTime: Date.now() - this.currentRoute.startTime,
        navigationHistory: this.navigationHistory
      });
    }
    
    this.stopNavigation();
  }

  // Handle going off route
  handleOffRoute() {
    console.log('⚠️ Off route detected, recalculating...');
    
    if (this.onOffRoute) {
      this.onOffRoute({
        currentPosition: this.currentPosition,
        originalRoute: this.currentRoute
      });
    }
    
    // Recalculate route from current position
    this.recalculateRoute();
  }

  // Recalculate route from current position
  async recalculateRoute() {
    try {
      if (!this.pathfinder || !this.currentPosition) return;
      
      const currentNode = this.pathfinder.findNearestNode(this.currentPosition.coords);
      const endNode = this.pathfinder.findNearestNode(this.currentRoute.endCoords);
      
      const newRoute = this.pathfinder.findShortestPath(currentNode, endNode);
      
      if (newRoute.success) {
        this.currentRoute.path = newRoute.path;
        this.currentRoute.distance = newRoute.distance;
        this.currentWaypointIndex = 0;
        
        console.log('✅ Route recalculated');
      }
      
    } catch (error) {
      console.error('❌ Route recalculation failed:', error);
    }
  }

  // Generate turn-by-turn instructions
  generateInstruction(currentWaypoint, nextWaypoint, distanceToWaypoint) {
    if (!nextWaypoint) {
      return `Continue to ${currentWaypoint.name || 'destination'}`;
    }
    
    const direction = this.getCardinalDirection(
      this.calculateBearing(currentWaypoint.coordinates, nextWaypoint.coordinates)
    );
    
    if (distanceToWaypoint < 20) {
      return `In ${Math.round(distanceToWaypoint)}m, head ${direction} to ${nextWaypoint.name}`;
    } else {
      return `Continue ${Math.round(distanceToWaypoint)}m to ${currentWaypoint.name}, then head ${direction}`;
    }
  }

  // Calculate bearing between two points
  calculateBearing(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  // Convert bearing to cardinal direction
  getCardinalDirection(bearing) {
    const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  // Calculate distance between two coordinates
  calculateDistance(coord1, coord2) {
    const toRad = (deg) => deg * (Math.PI / 180);
    const R = 6371000; // Earth's radius in meters

    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 + 
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
              Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Calculate distance from point to line segment
  calculateDistanceToLineSegment(point, lineStart, lineEnd) {
    const [px, py] = point;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    if (dx === 0 && dy === 0) {
      return this.calculateDistance(point, lineStart);
    }
    
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const projection = [x1 + t * dx, y1 + t * dy];
    
    return this.calculateDistance(point, projection);
  }

  // Update progress estimates
  updateProgressEstimates() {
    if (!this.currentRoute || !this.currentPosition) return;
    
    // Calculate remaining distance
    let remainingDistance = 0;
    for (let i = this.currentWaypointIndex; i < this.currentRoute.path.length - 1; i++) {
      const current = this.currentRoute.path[i];
      const next = this.currentRoute.path[i + 1];
      remainingDistance += this.calculateDistance(current.coordinates, next.coordinates);
    }
    
    // Add distance to current waypoint
    const currentWaypoint = this.currentRoute.path[this.currentWaypointIndex];
    remainingDistance += this.calculateDistance(
      this.currentPosition.coords,
      currentWaypoint.coordinates
    );
    
    // Estimate time based on walking speed (1.4 m/s average)
    this.estimatedTimeRemaining = Math.ceil(remainingDistance / 1.4);
  }

  // Handle navigation errors
  handleNavigationError(error) {
    console.error('🚨 Navigation Error:', error.message);
    
    if (this.onNavigationError) {
      this.onNavigationError(error);
    }
  }

  // Stop navigation
  stopNavigation() {
    console.log('⏹️ Stopping navigation...');
    
    this.isNavigating = false;
    
    // Stop GPS tracking
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    
    // Stop navigation loop
    if (this.navigationInterval) {
      clearInterval(this.navigationInterval);
      this.navigationInterval = null;
    }
    
    // Clear state
    this.currentRoute = null;
    this.currentPosition = null;
    this.currentWaypointIndex = 0;
  }

  // Complete navigation successfully
  completeNavigation() {
    console.log('✅ Navigation completed!');
    this.reachDestination();
  }

  // Get current navigation status
  getNavigationStatus() {
    return {
      isNavigating: this.isNavigating,
      currentPosition: this.currentPosition,
      currentWaypointIndex: this.currentWaypointIndex,
      totalWaypoints: this.currentRoute ? this.currentRoute.path.length : 0,
      totalDistanceTraveled: this.totalDistanceTraveled,
      estimatedTimeRemaining: this.estimatedTimeRemaining,
      route: this.currentRoute
    };
  }
}
