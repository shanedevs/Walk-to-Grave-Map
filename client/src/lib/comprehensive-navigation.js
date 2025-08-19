// Comprehensive Cemetery Navigation System
// This file contains the complete integration code for Dijkstra-based pathfinding

import CemeteryPathfinder from './pathfinder.js';

export class CemeteryNavigationSystem {
  constructor() {
    this.pathfinder = new CemeteryPathfinder();
    this.isPathfindingReady = false;
    this.currentNavPath = null;
    this.showPathways = true;
    this.directionUpdateInterval = null;
    this.isNavigating = false;
  }

  async initialize(map) {
    try {
      console.log('🚀 Initializing comprehensive cemetery navigation...');
      this.map = map;
      
      // Load comprehensive pathway data
      const pathwayResponse = await fetch('/src/lib/comprehensive-paths.geojson');
      const pathwayData = await pathwayResponse.json();
      
      // Build the navigation graph
      this.pathfinder.buildGraphFromGeoJSON(pathwayData);
      this.isPathfindingReady = true;
      
      console.log('✅ Pathfinding system ready!');
      console.log(`📊 Graph stats: ${this.pathfinder.nodes.size} nodes, ${this.pathfinder.getTotalEdges()} edges`);
      
      // Add pathway visualization to map
      this.addPathwayVisualizationToMap(pathwayData);
      
      // Load and integrate locator blocks
      await this.integrateCemeteryBlocks();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize pathfinding:', error);
      throw new Error('Failed to load navigation system');
    }
  }

  async integrateCemeteryBlocks() {
    try {
      // Load locator blocks data
      const locatorResponse = await fetch('/src/lib/locator-names.geojson');
      const locatorData = await locatorResponse.json();
      
      // Add missing block access points based on locator data
      locatorData.features.forEach(feature => {
        const blockName = feature.properties.name;
        const blockId = feature.properties.label;
        const coords = feature.geometry.coordinates;
        
        // Check if this block already has an access point
        const existingAccess = this.pathfinder.findNodeByBlock(blockName);
        if (!existingAccess) {
          // Add missing block access point
          const accessNodeId = `block_${blockId}_access_auto`;
          const nearestHub = this.findNearestHub(coords);
          
          // Add to pathfinder graph
          this.pathfinder.addBlockAccessPoint(accessNodeId, {
            name: `${blockName} Access`,
            type: 'block_access',
            coordinates: coords,
            serves_block: blockName,
            block_id: blockId,
            connects_to: [nearestHub]
          });
        }
      });
      
      console.log('✅ Cemetery blocks integrated with pathfinding system');
    } catch (error) {
      console.error('❌ Failed to integrate cemetery blocks:', error);
    }
  }

  findNearestHub(blockCoords) {
    const hubs = ['central_hub', 'phase2_hub', 'phase3_hub', 'bone_hub', 'child_hub'];
    let nearestHub = 'central_hub';
    let minDistance = Infinity;
    
    hubs.forEach(hubId => {
      if (this.pathfinder.nodes.has(hubId)) {
        const hubCoords = this.pathfinder.nodes.get(hubId).coordinates;
        const distance = this.pathfinder.calculateDistance(blockCoords, hubCoords);
        if (distance < minDistance) {
          minDistance = distance;
          nearestHub = hubId;
        }
      }
    });
    
    return nearestHub;
  }

  addPathwayVisualizationToMap(pathwayData) {
    if (!this.map) return;

    // Add pathway source
    this.map.addSource('cemetery-pathways', {
      type: 'geojson',
      data: pathwayData
    });

    // Add pathway lines with different styles for different types
    this.map.addLayer({
      id: 'pathway-lines',
      type: 'line',
      source: 'cemetery-pathways',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'type'], 'primary_path'], '#2563eb',
          ['==', ['get', 'type'], 'secondary_path'], '#3b82f6',
          ['==', ['get', 'type'], 'tertiary_path'], '#6366f1',
          ['==', ['get', 'type'], 'service_path'], '#f59e0b',
          '#6b7280'
        ],
        'line-width': [
          'case',
          ['==', ['get', 'width'], 'wide'], 4,
          ['==', ['get', 'width'], 'medium'], 3,
          ['==', ['get', 'width'], 'narrow'], 2,
          2
        ],
        'line-opacity': 0.7,
        'line-dasharray': [
          'case',
          ['==', ['get', 'type'], 'service_path'], [3, 2],
          [1, 0]
        ]
      },
      layout: {
        'visibility': this.showPathways ? 'visible' : 'none'
      }
    });

    // Add junction points
    this.map.addLayer({
      id: 'pathway-junctions',
      type: 'circle',
      source: 'cemetery-pathways',
      filter: ['all',
        ['==', ['geometry-type'], 'Point'],
        ['in', ['get', 'type'], ['literal', ['junction', 'section_hub']]]
      ],
      paint: {
        'circle-color': [
          'case',
          ['==', ['get', 'type'], 'junction'], '#dc2626',
          ['==', ['get', 'type'], 'section_hub'], '#7c3aed',
          '#6b7280'
        ],
        'circle-radius': [
          'case',
          ['==', ['get', 'type'], 'section_hub'], 8,
          6
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      },
      layout: {
        'visibility': this.showPathways ? 'visible' : 'none'
      }
    });

    // Add entrance points
    this.map.addLayer({
      id: 'pathway-entrances',
      type: 'circle',
      source: 'cemetery-pathways',
      filter: ['all',
        ['==', ['geometry-type'], 'Point'],
        ['==', ['get', 'type'], 'entrance']
      ],
      paint: {
        'circle-color': '#059669',
        'circle-radius': 10,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3
      },
      layout: {
        'visibility': this.showPathways ? 'visible' : 'none'
      }
    });

    // Add block access points
    this.map.addLayer({
      id: 'pathway-access-points',
      type: 'circle',
      source: 'cemetery-pathways',
      filter: ['all',
        ['==', ['geometry-type'], 'Point'],
        ['==', ['get', 'type'], 'block_access']
      ],
      paint: {
        'circle-color': '#16a34a',
        'circle-radius': 4,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
        'circle-opacity': 0.8
      },
      layout: {
        'visibility': this.showPathways ? 'visible' : 'none'
      }
    });

    // Add labels for important points
    this.map.addLayer({
      id: 'pathway-labels',
      type: 'symbol',
      source: 'cemetery-pathways',
      filter: ['all',
        ['==', ['geometry-type'], 'Point'],
        ['in', ['get', 'type'], ['literal', ['entrance', 'junction', 'section_hub']]]
      ],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'visibility': this.showPathways ? 'visible' : 'none'
      },
      paint: {
        'text-color': '#1f2937',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
      }
    });
  }

  async navigateToProperty(property, userLocation) {
    if (!this.isPathfindingReady || !this.pathfinder || !userLocation) {
      throw new Error('Navigation system not ready');
    }

    try {
      console.log('🧭 Starting Dijkstra navigation to:', property.name);
      
      // Find nearest nodes
      const userCoords = [userLocation.lng, userLocation.lat];
      const startNodeId = this.pathfinder.findNearestNode(userCoords);
      
      // Find destination node by block name or coordinates
      let endNodeId = this.pathfinder.findNodeByBlock(property.name);
      
      // If not found by name, try by block coordinates
      if (!endNodeId && property.latitude && property.longitude) {
        const destCoords = [parseFloat(property.longitude), parseFloat(property.latitude)];
        endNodeId = this.pathfinder.findNearestNode(destCoords);
      }
      
      // If still not found, use coordinates to find nearest access point
      if (!endNodeId) {
        const fallbackCoords = [120.9758, 14.47180]; // Default to central area
        endNodeId = this.pathfinder.findNearestNode(fallbackCoords);
        console.warn('⚠️ Using fallback destination for:', property.name);
      }

      if (!startNodeId || !endNodeId) {
        throw new Error('Could not find valid start or end points for navigation');
      }

      console.log(`🎯 Navigation route: ${startNodeId} -> ${endNodeId}`);

      // Calculate optimal path using Dijkstra's algorithm
      const pathResult = this.pathfinder.findShortestPath(startNodeId, endNodeId);

      if (!pathResult.success) {
        throw new Error(`No path found: ${pathResult.error || 'Unknown error'}`);
      }

      // Extract coordinates for map display
      const routeCoordinates = pathResult.path.map(point => point.coordinates);

      // Update current navigation state
      this.currentNavPath = pathResult;
      this.isNavigating = true;

      // Display route on map
      this.displayNavigationRoute(routeCoordinates, pathResult);

      // Return route info
      const minutes = Math.ceil(pathResult.duration);
      const meters = Math.round(pathResult.distance);
      
      return {
        success: true,
        distance: meters,
        duration: minutes,
        coordinates: routeCoordinates,
        pathInfo: pathResult
      };

    } catch (error) {
      console.error('❌ Navigation failed:', error);
      throw error;
    }
  }

  displayNavigationRoute(coordinates, pathInfo) {
    if (!this.map) return;

    // Remove existing route layers
    this.clearNavigationRoute();

    // Add new route source
    this.map.addSource('navigation-route', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { 
              type: 'active_route',
              distance: pathInfo.distance,
              duration: pathInfo.duration
            },
            geometry: {
              type: 'LineString',
              coordinates: coordinates
            }
          }
        ]
      }
    });

    // Active route line
    this.map.addLayer({
      id: 'navigation-route-line',
      type: 'line',
      source: 'navigation-route',
      paint: {
        'line-color': '#10b981',
        'line-width': 6,
        'line-opacity': 0.9
      }
    });

    // Start and end markers
    const startCoord = coordinates[0];
    const endCoord = coordinates[coordinates.length - 1];

    this.map.addSource('navigation-markers', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { type: 'start', label: 'Start' },
            geometry: { type: 'Point', coordinates: startCoord }
          },
          {
            type: 'Feature',
            properties: { type: 'end', label: 'Destination' },
            geometry: { type: 'Point', coordinates: endCoord }
          }
        ]
      }
    });

    this.map.addLayer({
      id: 'navigation-route-markers',
      type: 'circle',
      source: 'navigation-markers',
      paint: {
        'circle-color': [
          'case',
          ['==', ['get', 'type'], 'start'], '#3b82f6',
          ['==', ['get', 'type'], 'end'], '#ef4444',
          '#6b7280'
        ],
        'circle-radius': 8,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    });

    // Fit map to route with padding
    const bounds = coordinates.reduce((bounds, coord) => {
      return bounds.extend(coord);
    }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

    this.map.fitBounds(bounds, { 
      padding: { top: 50, bottom: 50, left: 50, right: 50 },
      maxZoom: 18
    });
  }

  startNavigationUpdates(userLocation, onProgress) {
    if (!this.currentNavPath || !userLocation) return;

    this.directionUpdateInterval = setInterval(() => {
      if (!this.isNavigating || !this.currentNavPath || !userLocation) {
        this.stopNavigationUpdates();
        return;
      }

      // Calculate current progress
      const userCoords = [userLocation.lng, userLocation.lat];
      const progress = this.calculateNavigationProgress(userCoords, this.currentNavPath.path);
      
      // Callback with progress
      if (onProgress) {
        onProgress({
          completedDistance: progress.completedDistance,
          percentage: progress.percentage,
          remainingDistance: this.currentNavPath.distance - progress.completedDistance,
          currentStep: this.getCurrentNavigationStep(progress.currentSegment)
        });
      }

      // Check if user has reached destination
      if (progress.percentage > 90) {
        this.completeNavigation();
      }

    }, 2000); // Update every 2 seconds
  }

  stopNavigationUpdates() {
    if (this.directionUpdateInterval) {
      clearInterval(this.directionUpdateInterval);
      this.directionUpdateInterval = null;
    }
  }

  calculateNavigationProgress(userCoords, pathCoords) {
    let closestPointIndex = 0;
    let minDistance = Infinity;
    
    // Find closest point on path
    pathCoords.forEach((coord, index) => {
      const distance = this.pathfinder.calculateDistance(userCoords, coord.coordinates);
      if (distance < minDistance) {
        minDistance = distance;
        closestPointIndex = index;
      }
    });

    // Calculate completed distance
    let completedDistance = 0;
    for (let i = 0; i < closestPointIndex; i++) {
      if (i < pathCoords.length - 1) {
        completedDistance += this.pathfinder.calculateDistance(
          pathCoords[i].coordinates, 
          pathCoords[i + 1].coordinates
        );
      }
    }

    const totalDistance = this.currentNavPath.distance;
    const percentage = (completedDistance / totalDistance) * 100;

    return {
      completedDistance,
      percentage: Math.min(percentage, 100),
      currentSegment: closestPointIndex
    };
  }

  getCurrentNavigationStep(segmentIndex) {
    if (!this.currentNavPath || !this.currentNavPath.path[segmentIndex]) {
      return 'Continue following the path';
    }

    const currentPoint = this.currentNavPath.path[segmentIndex];
    const nextPoint = this.currentNavPath.path[segmentIndex + 1];

    if (nextPoint) {
      return `Continue toward ${nextPoint.name || 'next waypoint'}`;
    } else {
      return 'You have reached your destination';
    }
  }

  completeNavigation() {
    this.isNavigating = false;
    this.stopNavigationUpdates();
    console.log('🎉 Navigation completed!');
  }

  togglePathwayVisibility() {
    if (!this.map) return;
    
    this.showPathways = !this.showPathways;
    const visibility = this.showPathways ? 'visible' : 'none';
    
    const layersToToggle = [
      'pathway-lines',
      'pathway-junctions', 
      'pathway-entrances',
      'pathway-access-points',
      'pathway-labels'
    ];

    layersToToggle.forEach(layerId => {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  }

  clearNavigationRoute() {
    if (!this.map) return;

    this.isNavigating = false;
    this.currentNavPath = null;
    this.stopNavigationUpdates();

    // Remove navigation layers
    const routeLayers = ['navigation-route-line', 'navigation-route-markers'];
    const routeSources = ['navigation-route', 'navigation-markers'];

    routeLayers.forEach(layerId => {
      if (this.map.getLayer(layerId)) {
        this.map.removeLayer(layerId);
      }
    });

    routeSources.forEach(sourceId => {
      if (this.map.getSource(sourceId)) {
        this.map.removeSource(sourceId);
      }
    });
  }

  // Get path statistics
  getPathStatistics() {
    return {
      totalNodes: this.pathfinder.nodes.size,
      totalEdges: this.pathfinder.getTotalEdges(),
      isReady: this.isPathfindingReady,
      currentlyNavigating: this.isNavigating
    };
  }
}

export default CemeteryNavigationSystem;
