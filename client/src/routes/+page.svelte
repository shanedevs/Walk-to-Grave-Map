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
  let routeProgress = $state(0); // Progress from 0 to 1
    let progressPercentage = $state(0);
  let directDistanceToDestination = $state(0);
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
  
  const locations = [
    { name: 'St Joseph', lng: 120.9758, lat: 14.4716 },
  ];
onMount(async () => {
  const pathSegments = window.location.pathname.split('/');
  selectedBlock = decodeURIComponent(pathSegments[pathSegments.length - 1]);

  // 🔹 Set matchName immediately
  if (selectedBlock && selectedBlock !== '' && selectedBlock !== 'map') {
    matchName = selectedBlock;
  }

  // Preselect property based on block name
  let success = tryPreselectBlock();

  if (!success) {
    await tick();
    success = tryPreselectBlock();
  }

  // ✅ Automatically start tracking once component mounts
  startTracking();

  // ✅ If block matched, auto-navigate
  if (success && selectedProperty && !isNavigating) {
    startNavigationToProperty(selectedProperty);
  }

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

  const initTimeout = setTimeout(() => {
    initializeMap();
  }, 100);

  return () => {
    if (map) {
      map.remove();
      map = null;
    }
    clearTimeout(initTimeout);

    // ❌ Remove this if `stopTracking()` is deleted
    // stopTracking();

    stopNavigation();
    window.removeEventListener('selectProperty', handleSelectProperty);
  };
});
function extractLngLatFromGeometry(geometry) {
  try {
    const coords = geometry?.coordinates?.[0]?.[0]?.[0]; // MultiPolygon > Polygon > Ring > Point
    if (coords && coords.length >= 2) {
      const [lng, lat] = coords;
      return { lng, lat };
    }
  } catch (err) {
    console.error('Failed to extract coordinates from geometry:', err);
  }
  return { lng: null, lat: null };
}

// Try to preselect a block from the URL

// 🔹 SOLUTION 3: Add a function to properly handle block preselection
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
    
    // 🔹 CRITICAL: Update matchName here too
    matchName = match.name;
    
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
    
  loadFeaturesFromMap();

  // ✅ All layers must be added only after the map loads
  map.on('load', async () => {
    isMapLoaded = true;
    map.resize();
    
    // 🔹 Add vector tileset source (from Mapbox Studio)
    map.addSource('custom-subdivision', {
      type: 'vector',
      url: 'mapbox:////intellitech.cmdngha7ab8101mpcv9pk5vt2-831gg' 
    });
    
    // 🔹 Add cemetery paths (as LineStrings)
    map.addLayer({
      id: 'cemetery-paths',
      type: 'line',
      source: 'custom-subdivision',
      'source-layer': 'subdivision-blocks',
      paint: {
        'line-color': '#ef4444',
        'line-width': 2,
        'line-opacity': 0
      },
      filter: ['==', '$type', 'LineString']
    });
    
    // 🔹 Add grave blocks (as Polygons)
    map.addLayer({
      id: 'grave-blocks',
      type: 'fill',
      source: 'custom-subdivision',
      'source-layer': 'subdivision-blocks',
      paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': 0.6
      },
      filter: ['==', '$type', 'Polygon']
    });
    
    // 🔹 Add property labels (symbol/text)
    map.addLayer({
      id: 'property-labels',
      type: 'symbol',
      source: 'custom-subdivision',
      'source-layer': 'subdivision-blocks',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-allow-overlap': false
      },
      paint: {
        'text-color': '#000000',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
      }
    });
    
    // 🖱️ Handle clicking on grave blocks
    map.on('click', 'grave-blocks', (e) => {
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
      
      // 🔹 SOLUTION 4: Update matchName when clicking on map
      matchName = name;
      
      startNavigationToProperty(property);
      showSuccess(`Selected property: ${name}`);
    });
    
    // ⏳ Wait for tiles to load
    map.once('idle', () => {
      setTimeout(() => {
        loadFeaturesFromMap();
        
        // 🔹 SOLUTION 5: Try to preselect again after map data loads
        if (selectedBlock && properties.length > 0) {
          const match = properties.find(p => p.name === selectedBlock);
          if (match) {
            const { lng, lat } = extractLngLatFromGeometry(match.geometry);
            selectedProperty = {
              ...match,
              lng,
              lat
            };
            matchName = match.name; // Update matchName here too
            
            // Navigate to the property
            if (!isNavigating) {
              startNavigationToProperty(selectedProperty);
            }
          }
        }
      }, 2000);
    });
    
    // 📍 Last seen
    fetchLastSeen(userId);
  });

selectedProperty = match;

// fetch last seen geo feature
async function fetchLastSeen(userId) {
  try {
    const res = await fetch(`/api/last-seen/${userId}`);
    if (!res.ok) throw new Error('Failed to fetch');

    const data = await res.json();
    const { latitude, longitude } = data;

    if (map) {
      flyTo({
        center: [longitude, latitude],
        zoom: 18,
        essential: true
      });

      // Optional: add a marker
      new mapboxgl.Marker({ color: '#ff0000' })
        .setLngLat([longitude, latitude])
        .addTo(map);
    }

    console.log('Fetched last seen:', { latitude, longitude });
  } catch (err) {
    console.error('Error fetching last seen:', err);
  }
}

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

    const resizeObserver = new ResizeObserver(() => {
      if (map) {
        map.resize();
      }
    });

    if (mapContainer) {
      resizeObserver.observe(mapContainer);
    }
    
  }

  function loadFeaturesFromMap() {
    // Query all polygon features (grave blocks)
    const polygonFeatures = map.queryRenderedFeatures({
      layers: ['grave-blocks']
    });

    // Process properties
    const processedProperties = [];
    const propertyNames = new Set();

    polygonFeatures.forEach(feature => {
      const name = feature.properties?.name;
      if (name && !propertyNames.has(name)) {
        propertyNames.add(name);
        processedProperties.push({
          id: feature.id,
          name,
          lng: feature.geometry.coordinates[0][0][0],
          lat: feature.geometry.coordinates[0][0][1],
          feature: feature
        });
      }
    });

    properties = processedProperties;
    showSuccess(`Loaded ${properties.length} grave blocks`);
  }

let destinationMarker = null; // make sure this is declared at top level

async function startNavigationToProperty(property) {
  if (!property || !userLocation) {
    showError('Please enable location tracking and select a property');
    return;
  }

  const propertyName = property.name?.trim();
  if (!propertyName) {
    showError('Invalid property name.');
    return;
  }
  
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

    // Fetch and draw the route
    const route = await getMapboxDirections(
      [userLocation.lng, userLocation.lat],
      [property.lng, property.lat]
    );

    currentRoute = route;
    displayRoute();
    startNavigationUpdates();
  } catch (error) {
    console.error('Navigation error:', error);
    showError('Failed to create route: ' + error.message);
    stopNavigation();
  } finally {
    isLoading = false;
  }
}


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
    // Simple point-in-polygon check

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
  // Use the actual entrance coordinates you provided
  return { 
    lng: 120.9768, 
    lat: 14.4727, 
    name: "Main Entrance" 
  };
}

 
async function navigateUsingInternalPaths(property) {
  // Query ALL path features from the layer
  const lineFeatures = map.queryRenderedFeatures({
    layers: ['cemetery-paths']
  });

  // Find the path closest to the property
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

  // Show only the selected path by filtering
  showOnlySelectedPath(closestPath);

  // Truncate the path to only go to the nearest point to the property
  const truncatedCoordinates = closestPath.coordinates.slice(0, closestPath.nearestIndex + 1);
  truncatedCoordinates.push(nearestPointOnPath.point);

  selectedLineString = {
    ...closestPath,
    coordinates: truncatedCoordinates
  };
}

function showOnlySelectedPath(selectedPath) {
  // Create a filter to show only the selected path
  const pathFilter = ['==', ['get', 'id'], selectedPath.id];
  
  // Apply filter to show only the selected path
  map.setFilter('cemetery-paths', pathFilter);
  
  // Make the filtered path visible
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

  // Also check points between line segments for more accuracy
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

      // Find closest point on route
      const { closestIndex, distance } = findClosestPointOnRoute(
        [userLocation.lng, userLocation.lat],
        currentRoute.coordinates
      );

      // Update direct distance to destination (straight line)
      const destination = currentRoute.coordinates[currentRoute.coordinates.length - 1];
      directDistanceToDestination = calculateDistance([userLocation.lng, userLocation.lat], destination);

      // Calculate progress percentage (0-100)
      const totalDistance = currentRoute.distance;
      const traveledDistance = calculatePathDistance(currentRoute.coordinates.slice(0, closestIndex + 1));
      progressPercentage = Math.min(100, Math.max(0, (traveledDistance / totalDistance) * 100));

      // Checking for cemetery
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

      // Update navigation state
      distanceToDestination = calculateRemainingDistance(closestIndex);
      currentStep = getCurrentStep(closestIndex);

      // Check if arrived
      if (closestIndex >= currentRoute.coordinates.length - 2) {
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
    showSuccess(`Arrived at ${selectedProperty?.name || 'destination'}`);
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
  
  // Clear route data
  currentRoute = null;
  selectedLineString = null;
  externalRoute = null;
  currentStep = '';
  distanceToDestination = 0;
}
  // Utility functions
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

  async function getMapboxDirections(start, end) {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      return {
        coordinates: data.routes[0].geometry.coordinates,
        distance: data.routes[0].distance,
        steps: data.routes[0].legs[0].steps.map(step => ({
          instruction: step.maneuver.instruction,
          distance: step.distance
        }))
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

  function showError(message) {
    errorMessage = message;
    setTimeout(() => errorMessage = null, 5000);
  }

  function showSuccess(message) {
    successMessage = message;
    setTimeout(() => successMessage = null, 5000);
  }
/////////////////////////// TRACKING FUNCTION ///////////////////
async function startTracking() {
  // 🔹 1. Check if geolocation is supported
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by this browser');
    return;
  }

  // 🔹 2. Request permission first (especially important for mobile)
  try {
    if ('permissions' in navigator) {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      console.log('Geolocation permission:', permission.state);
      
      if (permission.state === 'denied') {
        showError('Location permission denied. Please enable location access in your browser settings.');
        return;
      }
    }
  } catch (error) {
    console.log('Permission API not supported, continuing with geolocation request');
  }

  // 🔹 3. Mobile-optimized options
  const options = {
    enableHighAccuracy: true, // Use GPS if available
    timeout: 15000, // Increased timeout for mobile (15 seconds)
    maximumAge: 5000 // Allow 5-second old location
  };

  // 🔹 4. First, get current position to test if location works
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
    
    console.log('Initial location obtained:', position.coords);
    showSuccess('Location access granted!');
  } catch (error) {
    console.error('Initial geolocation failed:', error);
    handleGeolocationError(error);
    return;
  }

  // 🔹 5. Start watching position
  userLocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const newLocation = {
        lng: position.coords.longitude,
        lat: position.coords.latitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      };
      
      console.log('Location update:', newLocation);
      userLocation = newLocation;
      
      // Update user marker
      if (userMarker) {
        userMarker.setLngLat([newLocation.lng, newLocation.lat]);
      } else {
        userMarker = new mapboxgl.Marker({ 
          color: '#ef4444',
          scale: 1.2
        })
          .setLngLat([newLocation.lng, newLocation.lat])
          .addTo(map);
      }
      
      // Center map on user location (first time only)
      if (!hasInitialLocationSet) {
        map.flyTo({
          center: [newLocation.lng, newLocation.lat],
          zoom: 16
        });
        hasInitialLocationSet = true;
      }
      
      // If navigating, check if we've reached the cemetery
      if (isNavigating && !isInsideCemetery) {
        const cemeteryBoundary = getCemeteryBoundary();
        if (pointInPolygon([newLocation.lng, newLocation.lat], cemeteryBoundary)) {
          isInsideCemetery = true;
          showSuccess("Entered cemetery grounds - switching to internal navigation");
        }
      }
    },
    (error) => {
      console.error('Geolocation watch error:', error);
      handleGeolocationError(error);
    },
    options
  );
  
  isTracking = true;
  showSuccess('Location tracking started');
}

// 🔹 6. Better error handling for mobile
function handleGeolocationError(error) {
  let errorMessage = '';
  
  switch (error.code) {
    case error.PERMISSION_DENIED:
      errorMessage = "Location access denied. Please:\n\n" +
                    "1. Enable location services on your device\n" +
                    "2. Allow location access for this website\n" +
                    "3. Refresh the page and try again";
      break;
    case error.POSITION_UNAVAILABLE:
      errorMessage = "Location unavailable. Please:\n\n" +
                    "1. Make sure you're outdoors or near a window\n" +
                    "2. Check if location services are enabled\n" +
                    "3. Try again in a few moments";
      break;
    case error.TIMEOUT:
      errorMessage = "Location request timed out. Please:\n\n" +
                    "1. Make sure you have good GPS signal\n" +
                    "2. Try moving to an open area\n" +
                    "3. Refresh and try again";
      break;
    default:
      errorMessage = "Unknown location error occurred. Please refresh and try again.";
      break;
  }
  
  showError(errorMessage);
}

// 🔹 7. Add initial location flag
let hasInitialLocationSet = false;

// 🔹 8. Enhanced permission request function (call this on button click)
async function requestLocationPermission() {
  try {
    showSuccess('Requesting location permission...');
    
    // Try to get location - this will trigger the permission prompt
    const position = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Location request timed out'));
      }, 10000);
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeout);
          resolve(pos);
        },
        (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 10000
        }
      );
    });
    
    showSuccess('Location permission granted!');
    return true;
  } catch (error) {
    handleGeolocationError(error);
    return false;
  }
}

// 🔹 9. Check if we're on HTTPS (required for geolocation on mobile)
function checkHTTPS() {
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    showError('Location services require HTTPS. Please use a secure connection.');
    return false;
  }
  return true;
}

// 🔹 10. Initialize with proper checks
function initializeLocationServices() {
  if (!checkHTTPS()) return;
  
  // Request permission first, then start tracking
  requestLocationPermission().then(success => {
    if (success) {
      startTracking();
    }
  });
}
/////////////////////////////////////// TRACKING FUNCTION END //////////////////////


  function stopTracking() {
    if (userLocationWatchId) {
      navigator.geolocation.clearWatch(userLocationWatchId);
      userLocationWatchId = null;
    }
    
    if (userMarker) {
      userMarker.remove();
      userMarker = null;
    }
    
    userLocation = null;
    isTracking = false;
    showSuccess('Location tracking stopped');
  }

  function toggleTracking() {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  }

  function changeMapStyle(newStyle) {
    if (!map) return;
    
    const style = newStyle === 'osm' ? {
      version: 8,
      sources: {
        'osm': {
          type: 'raster',
          tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
          maxzoom: 19
        }
      },
      layers: [{
        id: 'osm-tiles',
        type: 'raster',
        source: 'osm',
        minzoom: 0,
        maxzoom: 22
      }]
    } : newStyle;
    
    map.setStyle(style);
  }

  $effect(() => {
    if (map && mapStyle) {
      changeMapStyle(mapStyle);
    }
  });

  
</script>
<svelte:head>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/@turf/turf@6/turf.min.js"></script>
</svelte:head>

<main class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
  <div class="max-w-7xl mx-auto">

    <!-- 🔷 Header -->
    <header class="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-xl p-6 shadow-lg text-center">
      <h1 class="text-3xl font-bold">Walk To Grave</h1>
      <p class="mt-2 opacity-90">Navigate to grave blocks with real-time location</p>
    </header>

    <!-- 🔔 Status Messages -->
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

    <!-- ⚙️ Controls Section -->
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
          🔍Looking for :
          <span class="ml-1 font-normal text-gray-600">
            {matchName || selectedProperty?.name || 'No block selected'} ?
          </span>
        </label>

        <label for="search" class="block text-sm font-semibold text-gray-700 mb-2 mt-4">
          Search Grave Block
        </label>
        <input
          id="search"
          type="text"
          placeholder="{matchName || selectedProperty?.name || 'No block selected'}"
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
    </section>

    <!-- 🗺️ Map Display -->
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

    <!-- 📊 Info Panel -->
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