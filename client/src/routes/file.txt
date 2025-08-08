<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  
  // Svelte 5 runes
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

  onMount(() => {
    window.addEventListener('selectProperty', (e) => {
      const propertyName = e.detail;
      const property = propertyFeatures.find(p => p.name === propertyName);
      if (property) {
        selectedProperty = property;
        startNavigationToProperty(property);
        showSuccess(`Selected property: ${propertyName}`);
      }
    });
    
    setTimeout(() => {
      initializeMap();
    }, 100);
    
    return () => {
      if (map) {
        map.remove();
        map = null;
      }
      stopTracking();
      stopNavigation();
      window.removeEventListener('selectProperty', () => {});
    };
  });
  
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

    map.on('load', () => {
      isMapLoaded = true;
      map.resize();

      // Add Mapbox Vector Tileset Source
      map.addSource('custom-subdivision', {
        type: 'vector',
        url: 'mapbox://intellitech.cmdbonx1p42jd1ms8ozhtm3y7-5x3ym'
      });

      map.addLayer({
  id: 'cemetery-paths',
  type: 'line',
  source: 'custom-subdivision',
  'source-layer': 'StartUp',
  paint: {
    'line-color': '#ef4444',
    'line-width': 2,
    'line-opacity': 0 // <-- Start with invisible paths
  },
  filter: ['==', '$type', 'LineString']
});

      // Add Polygon Layer (Grave Blocks)
      map.addLayer({
        id: 'grave-blocks',
        type: 'fill',
        source: 'custom-subdivision',
        'source-layer': 'StartUp',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.6
        },
        filter: ['==', '$type', 'Polygon']
      });

      // Add Property Labels
      map.addLayer({
        id: 'property-labels',
        type: 'symbol',
        source: 'custom-subdivision',
        'source-layer': 'StartUp',
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

      // Click Handler for Property Selection
      map.on('click', 'grave-blocks', (e) => {
        const feature = e.features[0];
        if (feature.properties?.name) {
          const property = {
            id: feature.id,
            name: feature.properties.name,
            lng: e.lngLat.lng,
            lat: e.lngLat.lat,
            feature: feature
          };
          
          selectedProperty = property;
          startNavigationToProperty(property);
          showSuccess(`Selected property: ${property.name}`);
        }
      });

      // Wait until tiles are rendered before querying
      map.once('idle', () => {
        setTimeout(() => {
          loadFeaturesFromMap();
        }, 2000);
      });

      // Add controls
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
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

  async function startNavigationToProperty(property) {
  if (!property || !userLocation) {
    showError('Please enable location tracking and select a property');
    return;
  }

  // Stop any existing navigation first
  stopNavigation();

  isLoading = true;
  isNavigating = true;
  
  try {
    // First check if we're already inside the cemetery
    const cemeteryBoundary = getCemeteryBoundary();
    isInsideCemetery = pointInPolygon(
      [userLocation.lng, userLocation.lat],
      cemeteryBoundary
    );

    if (isInsideCemetery) {
      // Use internal paths for navigation
      await navigateUsingInternalPaths(property);
      currentRoute = {
        coordinates: selectedLineString.coordinates,
        distance: calculatePathDistance(selectedLineString.coordinates),
        steps: createInternalSteps(selectedLineString.coordinates)
      };
    } else {
      // Get external route to cemetery entrance
      const nearestEntrance = findNearestEntrance();
      externalRoute = await getMapboxDirections(
        [userLocation.lng, userLocation.lat],
        [nearestEntrance.lng, nearestEntrance.lat]
      );
      
      await navigateUsingInternalPaths(property);
      
      currentRoute = {
        coordinates: [...externalRoute.coordinates, ...selectedLineString.coordinates],
        distance: externalRoute.distance + calculatePathDistance(selectedLineString.coordinates),
        steps: [
          ...externalRoute.steps,
          { instruction: "Enter cemetery grounds", distance: 0 },
          ...createInternalSteps(selectedLineString.coordinates)
        ]
      };
    }
    
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

  function startTracking() {
    if (!navigator.geolocation) {
      showError('Geolocation is not supported by this browser');
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1000
    };

    userLocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation = {
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          accuracy: position.coords.accuracy
        };
        
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
        console.error('Geolocation error:', error);
        showError('Error getting location: ' + error.message);
      },
      options
    );
    
    isTracking = true;
    showSuccess('Location tracking started');
  }

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
  <link href='https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css' rel='stylesheet' />
  <script src='https://unpkg.com/@turf/turf@6/turf.min.js'></script>
</svelte:head>

<main class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-xl p-6 shadow-lg">
      <h1 class="text-3xl font-bold text-center">Walk To Grave</h1>
      <p class="text-center mt-2 opacity-90">Navigate to grave blocks with real-time location</p>
    </div>
    
    <!-- Messages -->
    {#if errorMessage}
      <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">
        <div class="flex">
          <div class="ml-3">
            <p class="text-sm">{errorMessage}</p>
          </div>
        </div>
      </div>
    {/if}
    
    {#if successMessage}
      <div class="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert">
        <div class="flex">
          <div class="ml-3">
            <p class="text-sm">{successMessage}</p>
          </div>
        </div>
      </div>
    {/if}
    
    <!-- Controls -->
    <div class="bg-white p-6 border-x border-gray-200 shadow-sm">
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <!-- Map Style Selection -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">
            Map Style
          </label>
          <select 
            bind:value={mapStyle}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {#each mapStyles as style}
              <option value={style.value}>{style.label}</option>
            {/each}
          </select>
        </div>

        <!-- Property Selection -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">
            Select Grave Block
          </label>
          <select 
            bind:value={selectedProperty}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value={null}>Choose a grave block</option>
            {#each properties as property (property.id)}
              <option value={property}>{property.name}</option>
            {/each}
          </select>
        </div>
        
        <!-- Navigation Controls -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">
            Navigation
          </label>
          <div class="flex flex-col gap-2">
            <button
              onclick={() => startNavigationToProperty(selectedProperty)}
              disabled={isLoading || !selectedProperty}
              class="w-full px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Calculating route...' : 'Navigate'}
            </button>
            <button
              onclick={stopNavigation}
              disabled={!isNavigating}
              class="w-full px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Stop Navigation
            </button>
          </div>


        </div>
        
        <!-- Location Tracking -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">
            Location Tracking
          </label>
          <button
            onclick={toggleTracking}
            class="w-full px-3 py-2 text-sm rounded-lg transition-colors duration-200 {isTracking ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}"
          >
            {isTracking ? 'Stop Tracking' : 'Start Tracking'}
          </button>
        </div>

        <div class="bg-gray-50 p-3 rounded-lg">
      <h3 class="font-semibold text-gray-700 mb-1">Distance Remaining</h3>
      <p class="text-gray-600">
        {distanceToDestination ? `${(distanceToDestination).toFixed(0)} meters` : 'Not navigating'}
      </p>
    </div>

      </div>
    </div>
    
    <!-- Map Container -->
    <div class="relative bg-white border-x border-gray-200">
      <div 
        bind:this={mapContainer}
        class="w-full h-[500px] lg:h-[600px]"
        style="min-height: 400px;"
      ></div>
      
      {#if !map}
        <div class="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p class="text-gray-600">Loading map...</p>
          </div>
        </div>
      {/if}
    </div>
    
    <!-- Info Panel -->
    <div class="bg-white p-6 rounded-b-xl border-x border-b border-gray-200 shadow-lg">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
        <div class="bg-gray-50 p-3 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-1">Selected Grave Block</h3>
          <p class="text-gray-600">
            {selectedProperty?.name || 'None selected'}
          </p>
        </div>
        
        <div class="bg-gray-50 p-3 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-1">Navigation Status</h3>
          <p class="text-sm font-medium {isNavigating ? 'text-green-600' : 'text-red-600'}">
            {isNavigating ? 'Active' : 'Inactive'}
          </p>
        </div>
        
        <div class="bg-gray-50 p-3 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-1">Current Step</h3>
          <p class="text-gray-600">
            {currentStep || 'Not navigating'}
          </p>
        </div>

        <div class="bg-gray-50 p-3 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-1">Distance Remaining</h3>
          <p class="text-gray-600">
            {distanceToDestination ? `${(distanceToDestination).toFixed(0)} meters` : 'Not navigating'}
          </p>
        </div>
      </div>
    </div>
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