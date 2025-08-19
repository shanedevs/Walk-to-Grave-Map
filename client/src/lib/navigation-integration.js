// Cemetery Navigation Integration
// Add this to your +page.svelte script section

import CemeteryPathfinder from '$lib/pathfinder.js';

// Add these to your existing state variables
let pathfinder = $state(new CemeteryPathfinder());
let isPathfindingReady = $state(false);
let currentNavPath = $state(null);
let pathVisualization = $state(null);

// Modify your existing onMount function
onMount(async () => {
  // ... your existing code ...

  // Initialize pathfinding after map loads
  await initializePathfinding();
});

async function initializePathfinding() {
  try {
    console.log('🚀 Initializing advanced pathfinding...');
    
    // Load comprehensive pathway data
    const pathwayResponse = await fetch('/src/lib/comprehensive-paths.geojson');
    const pathwayData = await pathwayResponse.json();
    
    // Build the navigation graph
    pathfinder.buildGraphFromGeoJSON(pathwayData);
    isPathfindingReady = true;
    
    console.log('✅ Pathfinding system ready!');
    
    // Add pathway visualization to map
    addPathwayVisualizationToMap(pathwayData);
    
  } catch (error) {
    console.error('❌ Failed to initialize pathfinding:', error);
    showError('Failed to load navigation system');
  }
}

function addPathwayVisualizationToMap(pathwayData) {
  if (!map || !isMapLoaded) return;

  // Add pathway source
  map.addSource('cemetery-pathways', {
    type: 'geojson',
    data: pathwayData
  });

  // Add pathway lines
  map.addLayer({
    id: 'pathway-lines',
    type: 'line',
    source: 'cemetery-pathways',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': [
        'case',
        ['==', ['get', 'type'], 'primary_path'], '#2563eb',
        ['==', ['get', 'type'], 'secondary_path'], '#3b82f6',
        '#6b7280'
      ],
      'line-width': [
        'case',
        ['==', ['get', 'type'], 'primary_path'], 4,
        ['==', ['get', 'type'], 'secondary_path'], 3,
        2
      ],
      'line-opacity': 0.7
    }
  });

  // Add junction points
  map.addLayer({
    id: 'pathway-junctions',
    type: 'circle',
    source: 'cemetery-pathways',
    filter: ['all',
      ['==', ['geometry-type'], 'Point'],
      ['==', ['get', 'type'], 'junction']
    ],
    paint: {
      'circle-color': '#dc2626',
      'circle-radius': 6,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2
    }
  });

  // Add access points
  map.addLayer({
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
      'circle-stroke-width': 1
    }
  });
}

// Enhanced navigation function using Dijkstra
async function navigateToPropertyWithDijkstra(property) {
  if (!isPathfindingReady || !pathfinder || !userLocation) {
    showError('Navigation system not ready');
    return;
  }

  try {
    isLoading = true;
    
    // Find nearest nodes
    const userCoords = [userLocation.lng, userLocation.lat];
    const startNodeId = pathfinder.findNearestNode(userCoords);
    
    // Find destination node by block name
    let endNodeId = pathfinder.findNodeByBlock(property.name);
    
    // If not found, use coordinates
    if (!endNodeId) {
      const { lng, lat } = extractLngLatFromGeometry(property.geometry);
      endNodeId = pathfinder.findNearestNode([lng, lat]);
    }

    if (!startNodeId || !endNodeId) {
      throw new Error('Could not find valid start or end points');
    }

    console.log(`🎯 Starting navigation: ${startNodeId} -> ${endNodeId}`);

    // Calculate optimal path using Dijkstra's algorithm
    const pathResult = pathfinder.findShortestPath(startNodeId, endNodeId);

    if (!pathResult.success) {
      throw new Error('No path found to destination');
    }

    // Extract coordinates for map display
    const routeCoordinates = pathResult.path.map(point => point.coordinates);

    // Update current navigation state
    currentNavPath = pathResult;
    isNavigating = true;

    // Display route on map
    displayNavigationRoute(routeCoordinates, pathResult);

    // Show route info
    showSuccess(`Route calculated: ${pathResult.distance.toFixed(0)}m, ~${pathResult.duration} minutes`);

    // Start live navigation updates
    startNavigationUpdates();

  } catch (error) {
    console.error('❌ Navigation failed:', error);
    showError(`Navigation failed: ${error.message}`);
  } finally {
    isLoading = false;
  }
}

function displayNavigationRoute(coordinates, pathInfo) {
  if (!map) return;

  // Remove existing route
  if (map.getSource('navigation-route')) {
    map.removeLayer('navigation-route-line');
    map.removeLayer('navigation-route-markers');
    map.removeSource('navigation-route');
  }

  // Add new route
  map.addSource('navigation-route', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { type: 'route' },
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      ]
    }
  });

  // Route line
  map.addLayer({
    id: 'navigation-route-line',
    type: 'line',
    source: 'navigation-route',
    paint: {
      'line-color': '#10b981',
      'line-width': 6,
      'line-opacity': 0.8
    }
  });

  // Start and end markers
  const startCoord = coordinates[0];
  const endCoord = coordinates[coordinates.length - 1];

  map.addSource('navigation-markers', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { type: 'start' },
          geometry: { type: 'Point', coordinates: startCoord }
        },
        {
          type: 'Feature',
          properties: { type: 'end' },
          geometry: { type: 'Point', coordinates: endCoord }
        }
      ]
    }
  });

  map.addLayer({
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

  // Fit map to route
  const bounds = coordinates.reduce((bounds, coord) => {
    return bounds.extend(coord);
  }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

  map.fitBounds(bounds, { padding: 50 });
}

// Update your existing navigateToProperty function
function navigateToProperty(property) {
  if (!property || !property.name) return;
  
  selectedProperty = property;
  matchName = property.name;
  
  // Use enhanced Dijkstra navigation
  navigateToPropertyWithDijkstra(property);
}

// Add pathway toggle functionality
function togglePathwayVisibility() {
  if (!map) return;
  
  const visibility = map.getLayoutProperty('pathway-lines', 'visibility');
  const newVisibility = visibility === 'visible' ? 'none' : 'visible';
  
  map.setLayoutProperty('pathway-lines', 'visibility', newVisibility);
  map.setLayoutProperty('pathway-junctions', 'visibility', newVisibility);
  map.setLayoutProperty('pathway-access-points', 'visibility', newVisibility);
}
