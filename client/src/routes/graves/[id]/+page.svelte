<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';

  // Svelte 5 runes
  const entrance = findNearestEntrance(); // Point X
  let showConfirm = false;
  let showSearchDropdown = $state(false);
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
  let locatorProperties = $state([]);
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
  const pathSegments = window.location.pathname.split('/');
  if (pathSegments[1] === 'graves' && pathSegments[2]) {
    selectedBlock = decodeURIComponent(pathSegments[2]);
    matchName = selectedBlock;
    console.log('URL-based block selection:', selectedBlock);
  }


  // ✅ Wait for map to be fully initialized
  await new Promise(resolve => setTimeout(resolve, 100));
  initializeMap();

  // ✅ Auto erase and putback function when map loads
  if (selectedBlock) {
    await autoEraseAndPutBack();
  }

  // ✅ Ensure you wait until routeCoords and destination are available
  const waitForRoutingData = async () => {
    while (!userLocation || !routeCoords?.length || !routeSteps?.length || !destination) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('✅ Routing data ready. Starting navigation.');
  };



  await waitForRoutingData();

    

});

// ✅ Enhanced auto erase and putback function
async function autoEraseAndPutBack() {
  const originalMatchName = matchName;
  const originalSelectedProperty = selectedProperty;
  
  console.log('🔄 Auto erase and putback started for:', originalMatchName);
  
  // Step 1: Clear the values
  matchName = '';
  selectedProperty = null;
  
  // Step 2: Wait for map to fully load AND features to be loaded
  const waitForMapAndFeatures = async () => {
    let attempts = 0;
    const maxAttempts = 100; // 20 seconds max wait
    
    while (attempts < maxAttempts) {
      console.log(`⏳ Attempt ${attempts + 1}: isMapLoaded=${isMapLoaded}, properties.length=${properties.length}`);
      
      // Check if map is loaded and we have features from the map
      if (isMapLoaded && properties.length > 0) {
        console.log('✅ Map and properties are ready!');
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }
    
    console.error('❌ Timeout waiting for map and properties');
    return false;
  };
  
  const ready = await waitForMapAndFeatures();
  
  if (!ready) {
    // Restore original values if failed
    matchName = originalMatchName;
    selectedProperty = originalSelectedProperty;
    console.error('❌ Failed to load, restoring original values');
    return;
  }
  
// Step 3: Wait a bit more then restore
await new Promise(resolve => setTimeout(resolve, 500));

console.log('🔍 Searching for property:', originalMatchName);
console.log('📋 Available properties:', properties.map(p => p.name));

// Use the same filter logic from the input oninput
const val = originalMatchName.trim().toLowerCase();
const foundProperty = properties.find(p =>
  typeof p.name === 'string' && p.name.toLowerCase().includes(val)
);

if (foundProperty) {
  selectedProperty = foundProperty;
  matchName = originalMatchName;
  console.log('✅ Successfully restored property:', foundProperty);
} else {
  matchName = originalMatchName;
  console.log('⚠️ Property not found using input-like filter, restored matchName only');
  console.log('Available properties:', properties.map(p => `"${p.name}"`));
}
}
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
  if (!selectedBlock || !map?.getSource('locator-source')) return false;

  const source = map.getSource('locator-source');

  // Make sure it's a GeoJSON source
  if (source && source._data?.features) {
    const features = source._data.features;

    // Try to match block name (case insensitive)
    const matched = features.find((f) =>
      f.properties?.name?.toLowerCase() === selectedBlock.toLowerCase()
    );

    if (matched) {
      const [lng, lat] = matched.geometry.coordinates;

      const property = {
        id: matched.id,
        name: matched.properties.name,
        lng,
        lat,
        feature: matched
      };

      selectedProperty = property;
      matchName = selectedBlock;

      return true;
    }
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
map.once('idle', async () => {
  isMapLoaded = true;
  map.resize();

  // 🔹 Add vector sources
  map.addSource('subdivision-blocks-source', {
    type: 'vector',
    url: 'mapbox://intellitech.cmdysziqy2z5w1ppbaq7avd4f-1cy1n'
  });

  map.addSource('locator-blocks-source', {
    type: 'vector',
    url: 'mapbox://intellitech.cme0cp8bs0ato1plqyzz7xcp8-1904w'
  });

  // 🔹 Add subdivision block layers
  map.addLayer({
    id: 'cemetery-paths',
    type: 'line',
    source: 'subdivision-blocks-source',
    'source-layer': 'subdivision-blocks',
    paint: {
      'line-color': '#ffffff',
      'line-width': 3,
      'line-opacity': 1
    },
    filter: ['==', '$type', 'LineString']
  });

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

  // 🔹 Add locator block layers (used for navigation)
  map.addLayer({
    id: 'locator-blocks',
    type: 'circle',
    source: 'locator-blocks-source',
    'source-layer': 'locator-blocks',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        15, 6, 20, 10, 22, 14
      ],
      'circle-color': '#ef4444',
      'circle-stroke-width': 3,
      'circle-stroke-color': 'transparent',
      'circle-opacity': 0.0
    }
  });

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
      'text-opacity': 0.0
    }
  });

  map.addLayer({
    id: 'block-markers',
    type: 'circle',
    source: 'locator-blocks-source',
    'source-layer': 'locator-blocks',
    paint: {
      'circle-radius': 4,
      'circle-color': '#008000',
      'circle-opacity': 0.5
    }
  });

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

  // 🔹 Load cemetery paths for route logic
  await loadLineStringFeatures();

async function loadLineStringFeatures() {
  try {
    const features = map.querySourceFeatures('cemetery', {
      sourceLayer: 'cemetery-paths',
      filter: ['==', '$type', 'LineString']
    });

    lineStringFeatures = features.map(f => ({
      id: f.id,
      coordinates: f.geometry.coordinates,
      properties: f.properties,
      geometry: f.geometry
    }));

    console.log('✅ Loaded LineString features:', lineStringFeatures.length);
  } catch (error) {
    console.error('❌ Error loading LineString features:', error);
  }
}


  // 🔹 Handle map click on locator block
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
      goto(`/graves/${name}`);

  });

 map.once('idle', async () => {
    await zoomOutToLocatorBounds();
    await loadLocatorBlockFeatures();
    await loadFeaturesFromMap()
  });

  // 🔹 Cursor styles for locator blocks
  map.on('mouseenter', 'locator-blocks', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'locator-blocks', () => {
    map.getCanvas().style.cursor = '';
  });
// Count locator blocks once map is idle
    map.once('idle', () => {
      try {
        const features = map.querySourceFeatures('locator-blocks-source', {
          sourceLayer: 'locator-blocks',
        });
        const count = features.length;
        showSuccess(`Loaded ${count} locator blocks`);
        console.log(`Loaded ${count} locator blocks`);
      } catch (error) {
        console.error('Error loading locator blocks:', error);
        showError('Failed to count locator blocks.');
      }
    });

  // 🔹 After all layers are ready, try auto-navigation from URL
  map.once('idle', () => {
    setTimeout(async () => {
      await loadFeaturesFromMap();

      if (selectedBlock && properties.length > 0) {
        const success = tryPreselectBlock();

        if (success && selectedProperty && userLocation) {
          console.log('Auto-navigating to:', selectedProperty.name);
          await startNavigationToProperty(selectedProperty);
          showSuccess(`Auto-navigating to ${selectedProperty.name}`);
        } else if (success && selectedProperty && !userLocation) {
          showSuccess(`Block ${selectedProperty.name} selected. Starting location tracking...`);
          setTimeout(async () => {
            await startTracking();
            setTimeout(async () => {
              if (userLocation && selectedProperty) {
                console.log('Location acquired, auto-navigating to:', selectedProperty.name);
                await startNavigationToProperty(selectedProperty);
                showSuccess(`Auto-navigating to ${selectedProperty.name}`);
              }
            }, 3000);
          }, 500);
        };
        
      }
    }, 2000);
  });

  // 🔹 Auto-start tracking if block is present in URL
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
async function zoomOutToLocatorBounds() {
  const bounds = [
    [120.9749, 14.4705], // Southwest: lng, lat
    [120.9770, 14.4729]  // Northeast: lng, lat
  ];

  // Fit the map to the given bounds with animation and padding
  map.fitBounds(bounds, {
    padding: 50,
    animate: true
  });

  return new Promise(resolve => {
    // Wait for map rendering to finish
    map.once('idle', () => {
      console.log('[zoomOutToLocatorBounds] Map is idle. Waiting extra delay...');

      // Optional extra delay for visual completion
      setTimeout(() => {
        console.log('[zoomOutToLocatorBounds] Delay done. Proceeding...');
        resolve();
      }, 5000); // Increase if needed
    });
  });
}

async function loadLocatorBlockFeatures() {
const lineFeatures = map.querySourceFeatures('cemetery-paths', {
  sourceLayer: 'subdivision-blocks-source',
  filter: ['==', '$type', 'LineString']
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

function forceRouteThroughGate(routeCoordinates, mainGateCoord, userIsInside) {
  // 🚫 Don't touch internal-only routes
  if (userIsInside) {
    return routeCoordinates;
  }

  const startCoord = routeCoordinates[0];
  const endCoord   = routeCoordinates[routeCoordinates.length - 1];

  // How far route starts from the gate
  const startToGate = calculateDistance(startCoord, mainGateCoord);
  // How far route ends from the gate
  const endToGate   = calculateDistance(endCoord,   mainGateCoord);

  // Only prepend if the route starts NEAR the gate (within 30m)
  // and the gate isn't already the start, and route ends farther away from it
  if (
    startToGate < 30 &&
    startToGate < endToGate &&
    !(startCoord[0] === mainGateCoord[0] && startCoord[1] === mainGateCoord[1])
  ) {
    return [mainGateCoord, ...routeCoordinates];
  }

  return routeCoordinates;
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

function navigateToProperty(property) {
  if (!property || !property.name) {
    showError("Invalid property selected.");
    return;
  }

  selectedProperty = property;
  matchName = property.name;

}
function handleSearchButtonClick(name) {
  if (!name) {
    showError("Please enter a block name.");
    return;
  }

  // You might already have feature data from somewhere else
  const feature = getFeatureByName(name); // <- implement this to match your app
  if (!feature) {
    showError(`Block "${name}" not found.`);
    return;
  }

  const property = {
    id: feature.id,
    name: feature.properties.name,
    lng: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
    feature
  };

  navigateToProperty(property);
}

async function startNavigationToProperty(property) {
  if (!property || !userLocation) {
    showError('Please enable location tracking and select a property.');
    return;
  }

  stopNavigation();
  isLoading = true;
  isNavigating = true;

  function mergeRouteLegs(existing, incoming) {
    if (!incoming?.length) return existing;
    if (!existing.length) return [...incoming];
    const last = existing[existing.length - 1];
    const firstNew = incoming[0];
    if (last[0] !== firstNew[0] || last[1] !== firstNew[1]) {
      existing.push(firstNew);
    }
    return existing.concat(incoming.slice(1));
  }

  try {
    const userCoords = [userLocation.lng, userLocation.lat];
    const targetCoords = [property.lng, property.lat];

    const isInside = pointInPolygon(userCoords, getCemeteryBoundary());
    const isTargetInside = pointInPolygon(targetCoords, getCemeteryBoundary());

    let routeCoords = [];
    let navigationSteps = [];
    let totalDistance = 0;

    if (!destinationMarker) {
      destinationMarker = new mapboxgl.Marker({ color: '#1d4ed8', scale: 1.2 })
        .setLngLat(targetCoords).addTo(map);
    } else {
      destinationMarker.setLngLat(targetCoords);
    }

    // CASE 1: Both inside => pure internal navigation
    if (isInside && isTargetInside) {
      await navigateUsingInternalPaths(property, { lng: userCoords[0], lat: userCoords[1] });
      if (!selectedLineString?.coordinates?.length) {
        showError('No internal route found.');
        stopNavigation();
        return;
      }
      routeCoords = mergeRouteLegs(routeCoords, selectedLineString.coordinates);
      totalDistance += calculatePathDistance(selectedLineString.coordinates);
      navigationSteps.push(...createInternalSteps(selectedLineString.coordinates));
    }
    // CASE 2: Outside => Outside => use Mapbox direct route (skip “force exit”)
    else if (!isInside && !isTargetInside) {
      const outsideRoute = await getMapboxDirections(userCoords, targetCoords);
      if (outsideRoute?.coordinates?.length) {
        routeCoords = mergeRouteLegs(routeCoords, outsideRoute.coordinates);
        totalDistance += outsideRoute.distance;
        navigationSteps.push(...outsideRoute.steps);
      }
    }
    // CASE 3: Inside => Outside => go to cemetery exit first
    else if (isInside && !isTargetInside) {
      const exit = findNearestEntrance();
      await navigateUsingInternalPaths(exit, { lng: userCoords[0], lat: userCoords[1] });
      if (!selectedLineString?.coordinates?.length) {
        showError('No internal route found to exit.');
        stopNavigation();
        return;
      }
      routeCoords = mergeRouteLegs(routeCoords, selectedLineString.coordinates);
      totalDistance += calculatePathDistance(selectedLineString.coordinates);
      navigationSteps.push(...createInternalSteps(selectedLineString.coordinates));

      const exitCoords = [exit.lng, exit.lat];
      const outside = await getMapboxDirections(exitCoords, targetCoords);
      if (outside?.coordinates?.length) {
        routeCoords = mergeRouteLegs(routeCoords, outside.coordinates);
        totalDistance += outside.distance;
        navigationSteps.push(...outside.steps);
      }
    }
    // CASE 4: Outside => Inside => go via entrance then internal path
    else {
      const entrance = findNearestEntrance();
      const toEntrance = await getMapboxDirections(userCoords, [entrance.lng, entrance.lat]);
      if (toEntrance?.coordinates?.length) {
        routeCoords = mergeRouteLegs(routeCoords, toEntrance.coordinates);
        totalDistance += toEntrance.distance;
        navigationSteps.push(...toEntrance.steps);
      }
      await navigateUsingInternalPaths(property, entrance);
      if (!selectedLineString?.coordinates?.length) {
        showError('No internal route found.');
        stopNavigation();
        return;
      }
      routeCoords = mergeRouteLegs(routeCoords, selectedLineString.coordinates);
      totalDistance += calculatePathDistance(selectedLineString.coordinates);
      navigationSteps.push(...createInternalSteps(selectedLineString.coordinates));
    }

    currentRoute = { coordinates: routeCoords, distance: totalDistance, steps: navigationSteps };
    displayRoute();
    startNavigationUpdates(); // ⚠ make sure this has distance-based arrival check

  } catch (error) {
    console.error('Navigation error:', error);
    showError('Failed to create route: ' + (error.message || error));
    stopNavigation();
  } finally {
    isLoading = false;
  }
}

function haversineDistance(coord1, coord2) {
  const toRad = deg => deg * Math.PI / 180;
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;

  const R = 6371e3; // meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
      lng: 120.9767, 
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
    if (!selectedLineString?.coordinates?.length) {
    showError('No internal route found.');
    return;
  }

  }

  function showOnlySelectedPath(selectedPath) {
    const pathFilter = ['==', ['get', 'id'], selectedPath.id];
    map.setFilter('cemetery-paths', pathFilter);
    map.setPaintProperty('cemetery-paths', 'line-opacity', 0.8);
    map.setPaintProperty('cemetery-paths', 'line-color', '#ef4444');
    map.setPaintProperty('cemetery-paths', 'line-width', 3);
  }

function findNearestCemeteryEntry(userCoords, destinationCoords) {
  // Find the closest LineString path entry point
  let nearestEntry = null;
  let minDistance = Infinity;
  
  lineStringFeatures.forEach(lineString => {
    const coordinates = lineString.coordinates;
    // Check first and last points of each path as potential entry points
    [coordinates[0], coordinates[coordinates.length - 1]].forEach(entryPoint => {
      const distance = calculateDistance(userCoords, entryPoint);
      if (distance < minDistance) {
        minDistance = distance;
        nearestEntry = {
          point: entryPoint,
          lineString: lineString,
          distance: distance
        };
      }
    });
  });
  
  return nearestEntry;
}

function isPointInCemetery(coordinates) {
  // Check if point is within any subdivision-block polygon
  const point = turf.point([coordinates.lng, coordinates.lat]);
  const subdivisionFeatures = map.querySourceFeatures('subdivision', {
    sourceLayer: 'subdivision-blocks',
    filter: ['==', '$type', 'Polygon']
  });
  return subdivisionFeatures.length > 0;
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


function enforceRouteFromGate(userPoint, routeCoordinates, gateCoordinate) {
  // If user is near the gate, start the route from there
  const gateDistance = calculateDistance(userPoint, gateCoordinate);

  // If gate is not part of the current route yet, force route to start from there
  const gateIndexInRoute = routeCoordinates.findIndex(coord =>
    coord[0] === gateCoordinate[0] && coord[1] === gateCoordinate[1]
  );

  if (gateDistance < 50 && gateIndexInRoute !== 0) {
    // Forcefully insert gateCoordinate at the beginning
    const slicedRoute = routeCoordinates.slice(gateIndexInRoute);
    return [gateCoordinate, ...slicedRoute];
  }

  // Otherwise find closest point and continue from there
  const { closestIndex } = findClosestPointOnRoute(userPoint, routeCoordinates);
  return routeCoordinates.slice(closestIndex);
}


function startNavigationUpdates() {
  if (directionUpdateInterval) clearInterval(directionUpdateInterval);

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
        if (distanceToDestination < 8) {
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
  showExitPopup = true;

  showSuccess(`Arrived at ${selectedProperty?.name || 'destination'}`);

  setTimeout(() => {
    // Show confirmation dialog before navigating to exit
    showConfirmation({
      title: "Navigate to Exit?",
      message: "Do you want to navigate back to the Main Entrance?",
      confirmText: "Yes, guide me",
      cancelText: "No, stay here",
      onConfirm: () => {
        const MAIN_ENTRANCE = findNearestEntrance();
        showSuccess(`Navigating to ${MAIN_ENTRANCE.name}...`);
        startNavigationToProperty(MAIN_ENTRANCE);
      },
      onCancel: () => {
        showSuccess("Navigation ended. You may exit at your own pace.");
      }
    });
  }, 3000);
}

function showConfirmation({ title, message, confirmText, cancelText, onConfirm, onCancel }) {
  // Example: using a custom modal UI
  const confirmed = window.confirm(`${title}\n\n${message}`);
  if (confirmed) {
    onConfirm();
  } else {
    onCancel();
  }
}


// Always trusts the route returned by Mapbox (no more directional filtering)
async function getMapboxDirections(start, end) {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/` +
    `${start[0]},${start[1]};${end[0]},${end[1]}` +
    `?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;

  const response = await fetch(url);
  const data     = await response.json();

  if (data.routes && data.routes.length > 0) {
    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates,
      distance:    route.distance,
      steps:       route.legs[0].steps.map(step => ({
        instruction: step.maneuver.instruction,
        distance:    step.distance
      }))
    };
  }

  throw new Error('No route found');
}

function findClosestPointOnRoute(userPoint, routeCoordinates) {
  let closestPoint = null;
  let closestIndex = -1;
  let minDistance = Infinity;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const start = routeCoordinates[i];
    const end = routeCoordinates[i + 1];
    const result = nearestPointOnSegment(userPoint, start, end);

    if (result.distance < minDistance) {
      minDistance = result.distance;
      closestPoint = result.point;
      closestIndex = i; // Closest segment start index
    }
  }

  return { closestPoint, closestIndex, distance: minDistance };
}


async function getRouteBetween(start, end) {
  const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&access_token=${mapboxgl.accessToken}`);
  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    console.error("No routes found between", start, "and", end);
    return null;
  }

  return data.routes[0].geometry.coordinates;
}


function findClosestForwardPoint(userPoint, routeCoordinates, minIndex = 0) {
  let closestPoint = null;
  let closestIndex = minIndex;
  let shortestDistance = Infinity;

  for (let i = minIndex; i < routeCoordinates.length - 1; i++) {
    const projectedPoint = nearestPointOnSegment(userPoint, routeCoordinates[i], routeCoordinates[i + 1]);
    const distance = calculateDistance(userPoint, projectedPoint);

    if (distance < shortestDistance) {
      shortestDistance = distance;
      closestPoint = projectedPoint;
      closestIndex = i;
    }
  }

  return {
    point: closestPoint,
    index: closestIndex,
    distance: shortestDistance
  };
}

function getRouteToBlock(userPoint, gatePoint, routeCoordinates, blockPoint, threshold = 50) {
  const { point: closestPoint, distance } = findClosestPointOnRoute(userPoint, routeCoordinates);

  if (distance < threshold) {
    // 🟢 Close: use gate -> closest point -> follow route to block
    const startIndex = findNearestRouteIndex(closestPoint, routeCoordinates);
    const endIndex = findNearestRouteIndex(blockPoint, routeCoordinates);

    const routeSegment = routeCoordinates.slice(startIndex, endIndex + 1);

    return [gatePoint, ...routeSegment, blockPoint];
  } else {
    // 🔵 Far: use gate -> closest point -> closest forward point -> follow route to block
    const { point: forwardPoint, index: forwardIndex } = findClosestForwardPoint(userPoint, routeCoordinates);
    const blockIndex = findNearestRouteIndex(blockPoint, routeCoordinates);

    const routeSegment = routeCoordinates.slice(forwardIndex, blockIndex + 1);

    return [gatePoint, forwardPoint, ...routeSegment, blockPoint];
  }
}

function findNearestRouteIndex(targetPoint, routeCoordinates) {
  let minDistance = Infinity;
  let nearestIndex = 0;

  routeCoordinates.forEach((coord, i) => {
    const dist = calculateDistance(targetPoint, coord);
    if (dist < minDistance) {
      minDistance = dist;
      nearestIndex = i;
    }
  });

  return nearestIndex;
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

  // ✅ Auto-populate search input kapag may selectedProperty from dropdown
$effect(() => {
  if (selectedProperty && selectedProperty.name !== matchName) {
    matchName = selectedProperty.name;
  }
});

let searchableFeatures = [];


function handleSearchInput(event) {
  const val = event.target.value.trim();
  matchName = val;
  
  // Clear previous timeout
  clearTimeout(searchTimeout);
  
  // Debounce search
  searchTimeout = setTimeout(() => {
    if (val) {
      const foundProperty = properties.find(p => 
        p.name.toLowerCase().includes(val.toLowerCase())
      );
      
      // Only auto-select if exact match
      if (foundProperty && foundProperty.name.toLowerCase() === val.toLowerCase()) {
        selectedProperty = foundProperty;
      }
      // Don't clear selectedProperty for partial matches to avoid flickering
    } else {
      selectedProperty = null;
    }
  }, 300);
}

  // ✅ Toggle dropdown function
  function toggleSearchDropdown() {
    showSearchDropdown = !showSearchDropdown;
  }
  // ✅ Auto-sync between dropdown and search
  $effect(() => {
    if (selectedProperty?.name && selectedProperty.name !== matchName) {
      matchName = selectedProperty.name;
          if (selectedProperty.value) {
        searchQuery.value = selectedProperty.value.name;
    }
    }
  });
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
  <!--  <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">
          🔍 Looking for:
          <span class="ml-1 font-normal text-gray-600">
            {matchName || selectedProperty?.name || 'No block selected'}
          </span>
        <button 
          onclick={toggleSearchDropdown}
          class="w-full flex items-center justify-between px-3 py-2 bg-transparent border border-transparent rounded-md hover:bg-gray-100 focus:ring-0 focus:outline-none text-sm"
        >
          <div class="flex items-center space-x-2 text-gray-500">
          </div>
          <svg 
            class="w-4 h-4 text-gray-400 transform transition-transform duration-200 {showSearchDropdown ? 'rotate-180' : ''}" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
        </label>  -->

      {#if showSearchDropdown}
      <!-- Dropdown Content -->
        <div class="mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
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
              placeholder="Type grave block name..."
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            oninput={(e) => handleSearchInput}
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
        {#each properties as property, index (index)}
          <option value={property}>{property.name}</option>
        {/each}
              </select>
            </div>
          </div>
        </div>
      {/if}
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

   @keyframes slide-in-from-top {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-slide-in {
    animation: slide-in-from-top 0.2s ease-out;
  }
</style>