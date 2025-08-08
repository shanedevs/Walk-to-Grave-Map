<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { tick } from 'svelte';

  // Svelte 5 runes
  let matchName = $state('');
  let grave;
  let mapContainer = $state();
  let directionUpdateInterval = $state(null);
  let map = $state();
  let mapStyle = $state('mapbox://styles/mapbox/streets-v12');
  let markers = $state([]);
  let coordinates = $state({ lng: 120.9758, lat: 14.4716 });
  let zoom = $state(2);
  let userLocation = $state(null);
  let userMarker = $state(null);
  let userLocationWatchId = $state(null);
  let routeLine = $state(null);
  let isTracking = $state(false);
  let isMapLoaded = $state(false);
  let isLoading = $state(false);
  let errorMessage = $state(null);
  let successMessage = $state(null);
  let properties = $state([]);
  
  // Property navigation state
  let propertyFeatures = $state([]);
  let selectedProperty = $state(null);
  let userProximityToRoute = $state(null);
  let lineStringFeatures = $state([]);
  let selectedLineString = $state(null);
  let geoJsonData = $state(null);
  let selectedBlock = $state('');

  // Navigation state
  let isNavigating = $state(false);
  let currentRoute = $state(null);
  let externalRoute = $state(null);
  let isInsideCemetery = $state(false);
  let currentStep = $state('');
  let distanceToDestination = $state(0);
  let routeProgress = $state(0);
  let progressPercentage = $state(0);
  let directDistanceToDestination = $state(0);
  let showExitPopup = $state(false);
  
  let matchProperty = $derived(() => 
    matchName ? propertyFeatures.find((p) => p.name === matchName) : null
  );

  // Mapbox access token
  mapboxgl.accessToken = 'pk.eyJ1IjoiaW50ZWxsaXRlY2giLCJhIjoiY21jZTZzMm1xMHNmczJqcHMxOWtmaTd4aiJ9.rKhf7nuky9mqxxFAAIJlrQ';
  
  const mapStyles = [
    { value: 'mapbox://styles/mapbox/streets-v12', label: 'Mapbox Streets' },
    { value: 'mapbox://styles/mapbox/satellite-v9', label: 'Mapbox Satellite' },
    { value: 'mapbox://styles/mapbox/outdoors-v12', label: 'Mapbox Outdoors' },
    { value: 'mapbox://styles/mapbox/light-v11', label: 'Mapbox Light' },
    { value: 'mapbox://styles/mapbox/dark-v11', label: 'Mapbox Dark' },
    { value: 'osm', label: 'OpenStreetMap' }
  ];

  onMount(async () => {
    // Extract block name from URL path like /graves/Block-1-Private-14
    const pathSegments = window.location.pathname.split('/');
    if (pathSegments[1] === 'graves' && pathSegments[2]) {
      selectedBlock = decodeURIComponent(pathSegments[2]);
      matchName = selectedBlock;
      console.log('URL-based block selection:', selectedBlock);
    }

    // Initialize map first
    const initTimeout = setTimeout(() => {
      initializeMap();
    }, 100);

    // Auto-start tracking
    startTracking();

    // Event listener for manual property selection
    const handleSelectProperty = (e) => {
      const propertyName = e?.detail;
      const match = propertyFeatures.find(p => p.name === propertyName);
      if (match) {
        const { lng, lat } = extractLngLatFromGeometry(match.geometry);
        selectedProperty = { ...match, lng, lat };
        matchName = match.name;
        startNavigationToProperty(selectedProperty);
        showSuccess(`Selected property: ${propertyName}`);
      } else {
        showError('Property not found.');
      }
    };

    window.addEventListener('selectProperty', handleSelectProperty);

    return () => {
      if (map) {
        map.remove();
        map = null;
      }
      clearTimeout(initTimeout);
      stopNavigation();
      if (userLocationWatchId) {
        navigator.geolocation.clearWatch(userLocationWatchId);
      }
      window.removeEventListener('selectProperty', handleSelectProperty);
    };
  });

  function extractLngLatFromGeometry(geometry) {
    try {
      // Handle different geometry types
      if (geometry.type === 'Point') {
        const [lng, lat] = geometry.coordinates;
        return { lng, lat };
      } else if (geometry.type === 'Polygon') {
        const coords = geometry.coordinates[0][0];
        const [lng, lat] = coords;
        return { lng, lat };
      } else if (geometry.type === 'MultiPolygon') {
        const coords = geometry.coordinates[0][0][0];
        const [lng, lat] = coords;
        return { lng, lat };
      }
    } catch (err) {
      console.error('Failed to extract coordinates from geometry:', err);
    }
    return { lng: null, lat: null };
  }

  function tryPreselectBlock() {
    if (!selectedBlock || !properties || properties.length === 0) {
      return false;
    }
    
    const match = properties.find(p => p.name === selectedBlock);
    if (match) {
      const { lng, lat } = extractLngLatFromGeometry(match.geometry);
      selectedProperty = {
        ...match,
        lng,
        lat
      };
      matchName = match.name;
      console.log('Block preselected:', match.name);
      return true;
    }
    return false;
  }

  function initializeMap() {
    if (!mapContainer) return;
    
    const style = mapStyle === 'osm'
      ? {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
              maxzoom: 19
            }
          },
          layers: [
            {
              id: 'osm-tiles',
              type: 'raster',
              source: 'osm',
              minzoom: 0,
              maxzoom: 22
            }
          ]
        }
      : mapStyle;
      
    map = new mapboxgl.Map({
      container: mapContainer,
      style: style,
      center: [120.9763, 14.4725],
      zoom: 20,
      attributionControl: true,
      logoPosition: 'bottom-right'
    });
    
    let userId = localStorage.getItem('userId');
    if (!userId) {
      userId = 'user-' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('userId', userId);
    }
    
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true
    });
    map.addControl(geolocate);
    
    userMarker = new mapboxgl.Marker({ color: '#ef4444', scale: 1.2 })
      .setLngLat([120.9763, 14.4725])
      .addTo(map);

    // All layers must be added only after the map loads
    map.on('load', async () => {
      isMapLoaded = true;
      map.resize();
      
      // Add BOTH subdivision and locator block sources
      map.addSource('subdivision-blocks-source', {
        type: 'vector',
        url: 'mapbox://intellitech.cmdmlm8n90bju1onvjg1lijbp-54whw'
      });

      map.addSource('locator-blocks-source', {
        type: 'vector', 
        url: 'mapbox://intellitech.cmdn1h010040t1mp9nj1zae4h-4huwi'
      });
      
      // Add subdivision blocks layer (polygons) - LOWER opacity
      map.addLayer({
        id: 'subdivision-blocks',
        type: 'fill',
        source: 'subdivision-blocks-source',
        'source-layer': 'subdivision-blocks',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.3
        },
        filter: ['==', '$type', 'Polygon']
      });

      // Add subdivision blocks outline
      map.addLayer({
        id: 'subdivision-blocks-outline',
        type: 'line',
        source: 'subdivision-blocks-source',
        'source-layer': 'subdivision-blocks',
        paint: {
          'line-color': '#1d4ed8',
          'line-width': 1,
          'line-opacity': 0.5
        },
        filter: ['==', '$type', 'Polygon']
      });

      // Add locator blocks layer (points) - INVISIBLE but used for navigation
      map.addLayer({
        id: 'locator-blocks',
        type: 'circle',
        source: 'locator-blocks-source',
        'source-layer': 'locator-blocks', 
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15, 6,
            20, 10,
            22, 14
          ],
          'circle-color': '#ef4444',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.0  // INVISIBLE - used only for navigation logic
        }
      });

      // Add locator blocks labels - INVISIBLE
      map.addLayer({
        id: 'locator-blocks-labels',
        type: 'symbol',
        source: 'locator-blocks-source',
        'source-layer': 'locator-blocks',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 2],
          'text-anchor': 'top'
        },
        paint: {
          'text-color': '#ef4444',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
          'text-opacity': 0.0  // INVISIBLE - used only for navigation logic
        }
      });

      // Add tiny solid circles like Google Maps
      map.addLayer({
        id: 'block-markers',
        type: 'circle',
        source: 'locator-blocks-source',
        'source-layer': 'locator-blocks',
        paint: {
          'circle-radius': 4, // Tiny solid circle
          'circle-color': '#ef4444',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1.0
        }
      });

      // Add simple block labels (no child/adult/bone info)
      map.addLayer({
        id: 'block-labels',
        type: 'symbol',
        source: 'locator-blocks-source',
        'source-layer': 'locator-blocks',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold']
        },
        paint: {
          'text-color': '#374151',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1
        }
      });

      // Add cemetery paths
      map.addLayer({
        id: 'cemetery-paths',
        type: 'line',
        source: 'subdivision-blocks-source',
        'source-layer': 'subdivision-blocks',
        paint: {
          'line-color': '#ef4444',
          'line-width': 2,
          'line-opacity': 0
        },
        filter: ['==', '$type', 'LineString']
      });
      
      // Handle clicking on LOCATOR blocks (for navigation)
      map.on('click', 'locator-blocks', (e) => {
        const feature = e.features?.[0];
        const name = feature?.properties?.name;
        if (!name) return;
        
        const property = {
          id: feature.id,
          name,
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          feature
        };
        
        selectedProperty = property;
        matchName = name;
        
        startNavigationToProperty(property);
        showSuccess(`Selected locator: ${name}`);
      });

      // Change cursor on hover for locator blocks
      map.on('mouseenter', 'locator-blocks', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'locator-blocks', () => {
        map.getCanvas().style.cursor = '';
      });
      
      // Wait for tiles to load then try auto-navigation
      map.once('idle', () => {
        setTimeout(async () => {
          await loadFeaturesFromMap();
          
          // AUTO-NAVIGATION: Try to find and navigate to the block from URL
          if (selectedBlock && properties.length > 0) {
            const success = tryPreselectBlock();
            if (success && selectedProperty && userLocation) {
              console.log('Auto-navigating to:', selectedProperty.name);
              await startNavigationToProperty(selectedProperty);
              showSuccess(`Auto-navigating to ${selectedProperty.name}`);
            } else if (success && selectedProperty && !userLocation) {
              showSuccess(`Block ${selectedProperty.name} selected. Starting location tracking...`);
              // Auto-start location tracking and retry navigation
              setTimeout(async () => {
                await startTracking();
                // Wait a bit for location to be acquired, then auto-navigate
                setTimeout(async () => {
                  if (userLocation && selectedProperty) {
                    console.log('Location acquired, auto-navigating to:', selectedProperty.name);
                    await startNavigationToProperty(selectedProperty);
                    showSuccess(`Auto-navigating to ${selectedProperty.name}`);
                  }
                }, 3000);
              }, 500);
            } else {
              showError(`Block "${selectedBlock}" not found. Please check the block name.`);
            }
          }
        }, 2000);
      });

      // Auto-start location tracking if URL has block parameter
      if (selectedBlock) {
        setTimeout(() => {
          startTracking();
        }, 1000);
      }
    });

    // Mouse move handler
    map.on('mousemove', (e) => {
      coordinates = {
        lng: Number(e.lngLat.lng.toFixed(4)),
        lat: Number(e.lngLat.lat.toFixed(4))
      };
    });

    map.on('zoom', () => {
      zoom = Number(map.getZoom().toFixed(2));
    });

    map.on('error', (e) => {
      console.error('Map error:', e.error);
      showError('Map error: ' + e.error.message);
    });
  }

  async function loadFeaturesFromMap() {
    if (!map) return;
    
    // Query locator block features (points for navigation)
    const locatorFeatures = map.queryRenderedFeatures({
      layers: ['locator-blocks']
    });

    const processedProperties = [];
    const propertyNames = new Set();

    locatorFeatures.forEach(feature => {
      const name = feature.properties?.name;
      if (name && !propertyNames.has(name)) {
        propertyNames.add(name);
        const coordinates = feature.geometry.coordinates;
        processedProperties.push({
          id: feature.id || name,
          name,
          lng: coordinates[0],
          lat: coordinates[1],
          feature: feature
        });
      }
    });

    properties = processedProperties;
    propertyFeatures = processedProperties;
    console.log(`Loaded ${properties.length} locator blocks`);
  }

  let destinationMarker = null;

  async function startNavigationToProperty(property) {
    if (!property) {
      showError('Please select a property first');
      return;
    }

    if (!userLocation) {
      showError('Please enable location tracking to start navigation');
      return;
    }

    const propertyName = property.name?.trim();
    if (!propertyName) {
      showError('Invalid property name.');
      return;
    }
    
    // Update URL 
    const blockSegment = selectedBlock || propertyName;
    const path = `/graves/${encodeURIComponent(blockSegment)}`;
    history.pushState(null, '', path);

    // Reset navigation state
    stopNavigation();
    isLoading = true;
    isNavigating = true;

    try {
      // Remove old destination marker if any
      if (destinationMarker) {
        destinationMarker.remove();
        destinationMarker = null;
      }

      // Place a new pink marker
      destinationMarker = new mapboxgl.Marker({ color: '#f652a0' })
        .setLngLat([property.lng, property.lat])
        .addTo(map);

      // Fetch and draw the route with real Mapbox directions
      const route = await getMapboxDirections(
        [userLocation.lng, userLocation.lat],
        [property.lng, property.lat]
      );

      currentRoute = route;
      displayRoute();
      startNavigationUpdates();
      showSuccess(`Navigation started to ${propertyName}`);
    } catch (error) {
      console.error('Navigation error:', error);
      showError('Failed to create route: ' + error.message);
      stopNavigation();
    } finally {
      isLoading = false;
    }
  }

  // Route path directions functionality preserved from original
  function getCemeteryBoundary() {
    return [
      [120.975, 14.470],
      [120.978, 14.470],
      [120.978, 14.473],
      [120.975, 14.473],
      [120.975, 14.470]
    ];
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > point[1]) !== (yj > point[1]))
        && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function findNearestEntrance() {
    return { 
      lng: 120.9768, 
      lat: 14.4727, 
      name: "Main Entrance" 
    };
  }

  async function navigateUsingInternalPaths(property) {
    const lineFeatures = map.queryRenderedFeatures({
      layers: ['cemetery-paths']
    });

    let closestPath = null;
    let minDistance = Infinity;
    let nearestPointOnPath = null;

    lineFeatures.forEach(feature => {
      const nearestPoint = findNearestPointOnLine(
        [property.lng, property.lat],
        feature.geometry.coordinates
      );
      
      if (nearestPoint.distance < minDistance) {
        minDistance = nearestPoint.distance;
        nearestPointOnPath = nearestPoint;
        closestPath = {
          id: feature.id,
          name: feature.properties?.name || 'Path',
          coordinates: feature.geometry.coordinates,
          nearestIndex: nearestPoint.index
        };
      }
    });

    if (!closestPath) {
      throw new Error('No paths found in the cemetery');
    }

    showOnlySelectedPath(closestPath);

    const truncatedCoordinates = closestPath.coordinates.slice(0, closestPath.nearestIndex + 1);
    truncatedCoordinates.push(nearestPointOnPath.point);

    selectedLineString = {
      ...closestPath,
      coordinates: truncatedCoordinates
    };
  }

  function showOnlySelectedPath(selectedPath) {
    const pathFilter = ['==', ['get', 'id'], selectedPath.id];
    map.setFilter('cemetery-paths', pathFilter);
    map.setPaintProperty('cemetery-paths', 'line-opacity', 0.8);
    map.setPaintProperty('cemetery-paths', 'line-color', '#ef4444');
    map.setPaintProperty('cemetery-paths', 'line-width', 3);
  }

  function findNearestPointOnLine(targetPoint, lineCoordinates) {
    let nearestPoint = null;
    let minDistance = Infinity;
    let nearestIndex = 0;

    for (let i = 0; i < lineCoordinates.length; i++) {
      const distance = calculateDistance(targetPoint, lineCoordinates[i]);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = lineCoordinates[i];
        nearestIndex = i;
      }
    }

    for (let i = 0; i < lineCoordinates.length - 1; i++) {
      const segmentNearest = nearestPointOnSegment(
        targetPoint,
        lineCoordinates[i],
        lineCoordinates[i + 1]
      );
      
      if (segmentNearest.distance < minDistance) {
        minDistance = segmentNearest.distance;
        nearestPoint = segmentNearest.point;
        nearestIndex = i;
      }
    }

    return {
      point: nearestPoint,
      distance: minDistance,
      index: nearestIndex
    };
  }

  function nearestPointOnSegment(point, segmentStart, segmentEnd) {
    const A = point[0] - segmentStart[0];
    const B = point[1] - segmentStart[1];
    const C = segmentEnd[0] - segmentStart[0];
    const D = segmentEnd[1] - segmentStart[1];

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      return {
        point: segmentStart,
        distance: calculateDistance(point, segmentStart)
      };
    }

    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));

    const nearestPoint = [
      segmentStart[0] + param * C,
      segmentStart[1] + param * D
    ];

    return {
      point: nearestPoint,
      distance: calculateDistance(point, nearestPoint)
    };
  }

  function displayRoute() {
    if (!currentRoute) return;

    if (map.getSource('route')) map.removeSource('route');
    if (map.getLayer('route')) map.removeLayer('route');

    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: currentRoute.coordinates
        }
      }
    });

    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 6,
        'line-opacity': 0.8
      }
    });

    // Focused map view: fit to route bounds, not world map
    const bounds = new mapboxgl.LngLatBounds();
    currentRoute.coordinates.forEach(coord => bounds.extend(coord));
    map.fitBounds(bounds, { padding: 100 });
  }

  function startNavigationUpdates() {
    if (directionUpdateInterval) {
      clearInterval(directionUpdateInterval);
    }

    directionUpdateInterval = setInterval(() => {
      if (!isTracking || !userLocation || !currentRoute) return;

      const { closestIndex, distance } = findClosestPointOnRoute(
        [userLocation.lng, userLocation.lat],
        currentRoute.coordinates
      );

      const destination = currentRoute.coordinates[currentRoute.coordinates.length - 1];
      directDistanceToDestination = calculateDistance([userLocation.lng, userLocation.lat], destination);

      const totalDistance = currentRoute.distance;
      const traveledDistance = calculatePathDistance(currentRoute.coordinates.slice(0, closestIndex + 1));
      progressPercentage = Math.min(100, Math.max(0, (traveledDistance / totalDistance) * 100));

      if (!isInsideCemetery) {
        const cemeteryBoundary = getCemeteryBoundary();
        isInsideCemetery = pointInPolygon(
          [userLocation.lng, userLocation.lat],
          cemeteryBoundary
        );

        if (isInsideCemetery) {
          showSuccess("Entered cemetery grounds - switching to internal navigation");
        }
      }

      distanceToDestination = calculateRemainingDistance(closestIndex);
      currentStep = getCurrentStep(closestIndex);

      // Check if arrived at destination (within 10 meters)
      if (directDistanceToDestination < 10) {
        completeNavigation();
      }
    }, 1000);
  }

  function calculateRemainingDistance(closestIndex) {
    let distance = 0;
    const coords = currentRoute.coordinates;
    for (let i = closestIndex; i < coords.length - 1; i++) {
      distance += calculateDistance(coords[i], coords[i + 1]);
    }
    return distance;
  }

  function getCurrentStep(closestIndex) {
    if (!currentRoute?.steps) return '';
    
    let accumulatedDistance = 0;
    for (const step of currentRoute.steps) {
      accumulatedDistance += step.distance;
      if (accumulatedDistance >= closestIndex) {
        return step.instruction;
      }
    }
    return 'Continue to destination';
  }

  function completeNavigation() {
    stopNavigation();
    showExitPopup = true; // Show "Navigate to Exit" popup
    showSuccess(`Arrived at ${selectedProperty?.name || 'destination'}`);
  }

  async function getMapboxDirections(start, end) {
    const mainGate = { lng: 120.9768, lat: 14.4727 }; // Main entrance coordinates
    
    // Check if user is inside cemetery boundary
    const cemeteryBoundary = getCemeteryBoundary();
    const userInsideCemetery = pointInPolygon([start[0], start[1]], cemeteryBoundary);
    
    let waypoints, routeProfile;
    
    if (userInsideCemetery) {
      // If user is inside cemetery, try to use internal cemetery paths
      try {
        const internalRoute = await createInternalCemeteryRoute(start, end);
        if (internalRoute) {
          return internalRoute;
        }
      } catch (error) {
        console.warn('Failed to create internal route, falling back to direct path:', error);
      }
      // Fallback to direct route if internal paths fail
      waypoints = `${start[0]},${start[1]};${end[0]},${end[1]}`;
      routeProfile = 'walking';
    } else {
      // If user is outside cemetery, route through main gate first
      waypoints = `${start[0]},${start[1]};${mainGate.lng},${mainGate.lat};${end[0]},${end[1]}`;
      routeProfile = 'walking';
    }
    
    const url = `https://api.mapbox.com/directions/v5/mapbox/${routeProfile}/${waypoints}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      // Combine all legs into a single route
      let allCoordinates = [];
      let allSteps = [];
      let totalDistance = 0;
      
      data.routes[0].legs.forEach(leg => {
        allCoordinates = allCoordinates.concat(leg.geometry ? leg.geometry.coordinates : []);
        leg.steps.forEach(step => {
          allSteps.push({
            instruction: step.maneuver.instruction,
            distance: step.distance
          });
        });
        totalDistance += leg.distance;
      });
      
      // Remove duplicate coordinates at waypoint junctions
      allCoordinates = allCoordinates.filter((coord, index, arr) => {
        if (index === 0) return true;
        const prev = arr[index - 1];
        return !(coord[0] === prev[0] && coord[1] === prev[1]);
      });
      
      return {
        coordinates: allCoordinates,
        distance: totalDistance,
        steps: allSteps
      };
    }
    
    throw new Error('No route found');
  }

  function findClosestPointOnRoute(userPoint, routeCoordinates) {
    let closestIndex = 0;
    let minDistance = Infinity;
    
    routeCoordinates.forEach((coord, index) => {
      const distance = calculateDistance(userPoint, coord);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    });
    
    return { closestIndex, distance: minDistance };
  }

  function calculateDistance(point1, point2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = point1[1] * Math.PI / 180;
    const φ2 = point2[1] * Math.PI / 180;
    const Δφ = (point2[1] - point1[1]) * Math.PI / 180;
    const Δλ = (point2[0] - point1[0]) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  function calculateDistanceToPath(point, pathCoordinates) {
    if (!window.turf) return Infinity;
    
    try {
      const userPoint = turf.point(point);
      const line = turf.lineString(pathCoordinates);
      const nearest = turf.nearestPointOnLine(line, userPoint);
      return nearest.properties.dist * 1000; 
    } catch (error) {
      console.error('Distance calculation error:', error);
      return Infinity;
    }
  }

  function calculatePathDistance(coordinates) {
    let distance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      distance += calculateDistance(coordinates[i], coordinates[i + 1]);
    }
    return distance;
  }

  function createInternalSteps(coordinates) {
    return coordinates.map((coord, index) => ({
      instruction: index === 0 ? 'Start on cemetery path' : 
                   index === coordinates.length - 1 ? 'Arrive at grave block' : 
                   'Continue on path',
      distance: index < coordinates.length - 1 ? 
                calculateDistance(coord, coordinates[index + 1]) : 0
    }));
  }

  async function createInternalCemeteryRoute(start, end) {
    // Query all cemetery paths
    const pathFeatures = map.queryRenderedFeatures({
      layers: ['cemetery-paths']
    });

    if (!pathFeatures.length) {
      console.warn('No cemetery paths found');
      return null;
    }

    // Find the main path that connects entrance to destination area
    const mainPath = findMainCemeteryPath(pathFeatures, start, end);
    
    if (!mainPath) {
      console.warn('No suitable cemetery path found');
      return null;
    }

    // Create route following the main path, avoiding block areas
    const pathRoute = createPathBasedRoute(mainPath, start, end);
    
    return {
      coordinates: pathRoute.coordinates,
      distance: calculatePathDistance(pathRoute.coordinates),
      steps: createInternalSteps(pathRoute.coordinates)
    };
  }

  function findMainCemeteryPath(pathFeatures, start, end) {
    // Find path that's closest to both start and end points
    let bestPath = null;
    let bestScore = Infinity;

    pathFeatures.forEach(feature => {
      if (feature.geometry.type !== 'LineString') return;
      
      const coordinates = feature.geometry.coordinates;
      const startDistance = findNearestPointOnLine(start, coordinates).distance;
      const endDistance = findNearestPointOnLine(end, coordinates).distance;
      
      // Score based on combined distance to start and end
      const score = startDistance + endDistance;
      
      if (score < bestScore) {
        bestScore = score;
        bestPath = {
          coordinates,
          properties: feature.properties
        };
      }
    });

    return bestPath;
  }

  function createPathBasedRoute(mainPath, start, end) {
    const pathCoords = mainPath.coordinates;
    
    // Find connection points on the path
    const startConnection = findNearestPointOnLine(start, pathCoords);
    const endConnection = findNearestPointOnLine(end, pathCoords);
    
    // Create route: start -> path entry -> along path -> path exit -> end
    const route = [];
    
    // Add start point
    route.push(start);
    
    // Add connection to path
    route.push(startConnection.point);
    
    // Add path segment between connections
    const startIndex = Math.min(startConnection.index, endConnection.index);
    const endIndex = Math.max(startConnection.index, endConnection.index);
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (i < pathCoords.length) {
        route.push(pathCoords[i]);
      }
    }
    
    // Add connection from path to destination
    route.push(endConnection.point);
    
    // Add final destination
    route.push(end);
    
    // Remove duplicate consecutive points
    const cleanedRoute = route.filter((coord, index) => {
      if (index === 0) return true;
      const prev = route[index - 1];
      return !(coord[0] === prev[0] && coord[1] === prev[1]);
    });
    
    return {
      coordinates: cleanedRoute
    };
  }

  function startTracking() {
    if (!navigator.geolocation) {
      showError('Geolocation is not supported by this browser');
      return;
    }

    isTracking = true;
    userLocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        userLocation = {
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          accuracy: position.coords.accuracy
        };
        
        if (userMarker) {
          userMarker.setLngLat([userLocation.lng, userLocation.lat]);
        }

        // Update distance if navigating
        if (isNavigating && selectedProperty) {
          distanceToDestination = calculateDistance(
            userLocation.lat, userLocation.lng,
            selectedProperty.lat, selectedProperty.lng
          );
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        showError('Location tracking failed');
        isTracking = false;
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function toggleTracking() {
    if (isTracking) {
      if (userLocationWatchId) {
        navigator.geolocation.clearWatch(userLocationWatchId);
        userLocationWatchId = null;
      }
      isTracking = false;
      userLocation = null;
      showSuccess('Location tracking stopped');
    } else {
      startTracking();
      showSuccess('Location tracking started');
    }
  }

  function stopNavigation() {
    isNavigating = false;
    
    // Clear the navigation interval
    if (directionUpdateInterval) {
      clearInterval(directionUpdateInterval);
      directionUpdateInterval = null;
    }
    
    // Remove route display
    if (map && map.getSource('route')) {
      map.removeLayer('route');
      map.removeSource('route');
    }
    
    // Hide ALL cemetery paths and remove filter
    if (map && map.getLayer('cemetery-paths')) {
      map.setPaintProperty('cemetery-paths', 'line-opacity', 0);
      map.setFilter('cemetery-paths', null); // Remove filter to show all paths again
    }
    
    // Remove destination marker
    if (destinationMarker) {
      destinationMarker.remove();
      destinationMarker = null;
    }
    
    // Clear route data
    currentRoute = null;
    selectedLineString = null;
    externalRoute = null;
    currentStep = '';
    distanceToDestination = 0;
  }

  function navigateToExit() {
    showExitPopup = false;
    const entrance = findNearestEntrance();
    
    if (userLocation) {
      // Start navigation to cemetery exit
      startNavigationToProperty({
        name: "Cemetery Exit",
        lng: entrance.lng,
        lat: entrance.lat
      });
      showSuccess("Navigating to cemetery exit");
    } else {
      showError("Location tracking required for exit navigation");
    }
  }

  function showSuccess(message) {
    successMessage = message;
    console.log('Success:', message);
    setTimeout(() => {
      if (successMessage === message) {
        successMessage = null;
      }
    }, 3000);
  }

  function showError(message) {
    errorMessage = message;
    console.error('Error:', message);
    setTimeout(() => {
      if (errorMessage === message) {
        errorMessage = null;
      }
    }, 5000);
  }
</script>

<svelte:head>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/@turf/turf@6/turf.min.js"></script>
</svelte:head>

<main class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
  <div class="max-w-7xl mx-auto">

    <!-- Header -->
    <header class="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-xl p-6 shadow-lg text-center">
      <h1 class="text-3xl font-bold">Walk To Grave</h1>
      <p class="mt-2 opacity-90">Navigate to grave blocks with real-time location</p>
    </header>

    <!-- Status Messages -->
    {#if errorMessage}
      <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 my-4" role="alert">
        <p class="text-sm">{errorMessage}</p>
      </div>
    {/if}

    {#if successMessage}
      <div class="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 my-4" role="alert">
        <p class="text-sm">{successMessage}</p>
      </div>
    {/if}

    <!-- Controls Section -->
    <section class="bg-white p-6 border-x border-gray-200 shadow-sm grid grid-cols-1 lg:grid-cols-4 gap-6">

      <!-- Map Style -->
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-2">Map Style</label>
        <select bind:value={mapStyle} class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
          {#each mapStyles as style}
            <option value={style.value}>{style.label}</option>
          {/each}
        </select>
      </div>

      <!-- Grave Block Search -->
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">
          🔍 Looking for:
          <span class="ml-1 font-normal text-gray-600">
            {matchName || selectedProperty?.name || 'No block selected'}
          </span>
        </label>

        <label for="search" class="block text-sm font-semibold text-gray-700 mb-2 mt-4">
          Search Grave Block
        </label>
        <input
          id="search"
          type="text"
          placeholder="{matchName || selectedProperty?.name || 'Enter block name'}"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          oninput={(e) => {
            const val = e.target.value.trim().toLowerCase();
            selectedProperty = properties.find(p => p.name.toLowerCase().includes(val)) ?? null;
          }}
        />

        <!-- Block Selection -->
        <div class="w-full">
          <label class="block text-sm font-semibold text-gray-700 mb-2 mt-4">
            List of Grave Block
          </label>
          <select
            bind:value={selectedProperty}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value={null}>Select a block</option>
            {#each properties as property (property.id)}
              <option value={property}>{property.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Navigation Controls -->
      <div class="col-span-1 lg:col-span-2 flex flex-col gap-2">
        <button
          onclick={() => startNavigationToProperty(selectedProperty)}
          disabled={isLoading || !selectedProperty}
          class="w-full px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg transition disabled:opacity-50"
        >
          {isLoading ? 'Calculating route...' : 'Navigate'}
        </button>
        
        <!-- Location Tracking -->
        <div>
          <button
            onclick={toggleTracking}
            class="w-full px-3 py-2 text-sm rounded-lg transition-colors duration-200 {isTracking ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}"
          >
            {isTracking ? 'Stop Tracking' : 'Start Tracking'}
          </button>
        </div>

        <!-- Distance Remaining (Compact) -->
        <div class="bg-gray-50 p-3 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-1">Distance Remaining</h3>
          <p class="text-gray-600">
            {distanceToDestination ? `${distanceToDestination.toFixed(0)} meters` : 'Not navigating'}
          </p>
        </div>
      </div>
    </section>

    <!-- Map Display -->
    <section class="relative bg-white border-x border-gray-200 my-6">
      <div bind:this={mapContainer} class="w-full h-[500px] lg:h-[600px]"></div>

      {#if !map}
        <div class="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p class="text-gray-600">Loading map...</p>
          </div>
        </div>
      {/if}
    </section>

    <!-- Info Panel -->
    <section class="bg-white p-6 rounded-b-xl border-x border-b border-gray-200 shadow-lg">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
        <div class="bg-gray-50 p-3 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-1">Selected Grave Block</h3>
          <p class="text-gray-600">{selectedProperty?.name || 'None selected'}</p>
        </div>

        <div class="bg-gray-50 p-3 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-1">Navigation Status</h3>
          <p class="font-medium {isNavigating ? 'text-green-600' : 'text-red-600'}">
            {isNavigating ? 'Active' : 'Inactive'}
          </p>
        </div>

        <div class="bg-gray-50 p-3 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-1">Current Step</h3>
          <p class="text-gray-600">{currentStep || 'Not navigating'}</p>
        </div>

        <div class="bg-gray-50 p-3 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-1">Distance Remaining</h3>
          <p class="text-gray-600">
            {distanceToDestination ? `${distanceToDestination.toFixed(0)} meters` : 'Not navigating'}
          </p>
        </div>
      </div>
    </section>
  </div>

  <!-- Navigate to Exit Popup -->
  {#if showExitPopup}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 m-4 max-w-sm w-full shadow-xl">
        <div class="text-center">
          <div class="text-green-500 mb-4">
            <svg class="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">
            Destination Reached!
          </h3>
          <p class="text-gray-600 mb-6">
            You have arrived at {selectedProperty?.name}. Would you like to navigate to the cemetery exit?
          </p>
          <div class="flex gap-3">
            <button
              onclick={() => showExitPopup = false}
              class="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
            >
              Stay Here
            </button>
            <button
              onclick={navigateToExit}
              class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              Navigate to Exit
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  @import 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';

  :global(.mapboxgl-popup-content) {
    border-radius: 0.75rem;
    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04);
    padding: 0;
    max-width: 300px;
  }

  :global(.mapboxgl-popup-close-button) {
    color: rgb(107 114 128);
    font-size: 18px;
    padding: 8px;
  }

  :global(.mapboxgl-popup-close-button:hover) {
    color: rgb(55 65 81);
    background-color: rgb(243 244 246);
  }

  :global(.mapboxgl-popup-tip) {
    border-top-color: white;
  }
</style>