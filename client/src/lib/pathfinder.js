// Dijkstra's Algorithm Implementation for Cemetery Navigation
// This creates a weighted graph from the GeoJSON pathway data

export class CemeteryPathfinder {
  constructor() {
    this.graph = new Map(); // adjacency list representation
    this.nodes = new Map(); // node ID to coordinates mapping
    this.pathways = []; // store all pathway features
  }

  /**
   * Build graph from comprehensive GeoJSON pathway data
   * @param {Object} geoJsonData - The comprehensive paths GeoJSON
   */
  buildGraphFromGeoJSON(geoJsonData) {
    console.log('🏗️ Building navigation graph...');
    
    // First pass: Create all nodes
    geoJsonData.features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const nodeId = feature.properties.id;
        const coords = feature.geometry.coordinates;
        
        this.nodes.set(nodeId, {
          id: nodeId,
          coordinates: coords,
          name: feature.properties.name,
          type: feature.properties.type,
          properties: feature.properties
        });
        
        // Initialize adjacency list for this node
        if (!this.graph.has(nodeId)) {
          this.graph.set(nodeId, []);
        }
      }
    });

    // Second pass: Create edges from LineString pathways
    geoJsonData.features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        this.addPathwayToGraph(feature);
      }
    });

    // Third pass: Add connections from node properties
    this.nodes.forEach((node, nodeId) => {
      if (node.properties.connects_to) {
        node.properties.connects_to.forEach(connectedNodeId => {
          this.addEdge(nodeId, connectedNodeId);
        });
      }
    });

    console.log(`✅ Graph built: ${this.nodes.size} nodes, ${this.getTotalEdges()} edges`);
  }

  /**
   * Add a pathway (LineString) to the graph
   * @param {Object} pathwayFeature - GeoJSON LineString feature
   */
  addPathwayToGraph(pathwayFeature) {
    const coords = pathwayFeature.geometry.coordinates;
    const pathwayProps = pathwayFeature.properties;
    
    // Create intermediate nodes for each coordinate in the path
    for (let i = 0; i < coords.length; i++) {
      const nodeId = `${pathwayProps.id}_point_${i}`;
      
      this.nodes.set(nodeId, {
        id: nodeId,
        coordinates: coords[i],
        name: `${pathwayProps.name} Point ${i}`,
        type: 'pathway_point',
        pathway_id: pathwayProps.id
      });

      if (!this.graph.has(nodeId)) {
        this.graph.set(nodeId, []);
      }

      // Connect to previous point in the path
      if (i > 0) {
        const prevNodeId = `${pathwayProps.id}_point_${i-1}`;
        this.addEdge(prevNodeId, nodeId);
      }
    }

    // Connect pathway endpoints to junction/access points
    if (pathwayProps.connects_to) {
      const startNodeId = `${pathwayProps.id}_point_0`;
      const endNodeId = `${pathwayProps.id}_point_${coords.length - 1}`;
      
      pathwayProps.connects_to.forEach(connectedId => {
        // Connect start point to connected nodes
        this.addEdge(startNodeId, connectedId);
        // Connect end point to connected nodes
        this.addEdge(endNodeId, connectedId);
      });
    }
  }

  /**
   * Add bidirectional edge between two nodes
   * @param {string} nodeA - First node ID
   * @param {string} nodeB - Second node ID
   */
  addEdge(nodeA, nodeB) {
    if (!this.nodes.has(nodeA) || !this.nodes.has(nodeB)) {
      console.warn(`⚠️ Trying to connect non-existent nodes: ${nodeA} -> ${nodeB}`);
      return;
    }

    const coordsA = this.nodes.get(nodeA).coordinates;
    const coordsB = this.nodes.get(nodeB).coordinates;
    const distance = this.calculateDistance(coordsA, coordsB);

    // Add edge A -> B
    if (!this.graph.get(nodeA).some(edge => edge.to === nodeB)) {
      this.graph.get(nodeA).push({ to: nodeB, weight: distance });
    }

    // Add edge B -> A (bidirectional)
    if (!this.graph.get(nodeB).some(edge => edge.to === nodeA)) {
      this.graph.get(nodeB).push({ to: nodeA, weight: distance });
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param {Array} coord1 - [longitude, latitude]
   * @param {Array} coord2 - [longitude, latitude]
   * @returns {number} Distance in meters
   */
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

  /**
   * Find shortest path using Dijkstra's algorithm
   * @param {string} startNodeId - Starting node ID
   * @param {string} endNodeId - Destination node ID
   * @returns {Object} { path: Array, distance: number, duration: number }
   */
  findShortestPath(startNodeId, endNodeId) {
    console.log(`🧭 Finding shortest path: ${startNodeId} -> ${endNodeId}`);

    if (!this.nodes.has(startNodeId) || !this.nodes.has(endNodeId)) {
      throw new Error('Start or end node not found in graph');
    }

    const distances = new Map();
    const previous = new Map();
    const visited = new Set();
    const priorityQueue = [];

    // Initialize distances
    this.nodes.forEach((node, nodeId) => {
      distances.set(nodeId, nodeId === startNodeId ? 0 : Infinity);
      priorityQueue.push({ nodeId, distance: distances.get(nodeId) });
    });

    while (priorityQueue.length > 0) {
      // Sort by distance and get nearest unvisited node
      priorityQueue.sort((a, b) => a.distance - b.distance);
      const { nodeId: currentNode } = priorityQueue.shift();

      if (visited.has(currentNode)) continue;
      visited.add(currentNode);

      // Found destination
      if (currentNode === endNodeId) break;

      // Check all neighbors
      const neighbors = this.graph.get(currentNode) || [];
      neighbors.forEach(({ to: neighbor, weight }) => {
        if (visited.has(neighbor)) return;

        const altDistance = distances.get(currentNode) + weight;
        if (altDistance < distances.get(neighbor)) {
          distances.set(neighbor, altDistance);
          previous.set(neighbor, currentNode);
          
          // Update priority queue
          const queueItem = priorityQueue.find(item => item.nodeId === neighbor);
          if (queueItem) {
            queueItem.distance = altDistance;
          }
        }
      });
    }

    // Reconstruct path
    const path = [];
    let current = endNodeId;
    while (current !== undefined) {
      path.unshift(current);
      current = previous.get(current);
    }

    // Convert node IDs to coordinates
    const coordinates = path.map(nodeId => ({
      nodeId,
      coordinates: this.nodes.get(nodeId).coordinates,
      name: this.nodes.get(nodeId).name,
      type: this.nodes.get(nodeId).type
    }));

    const totalDistance = distances.get(endNodeId);
    const estimatedDuration = this.estimateWalkingTime(totalDistance);

    console.log(`✅ Path found: ${path.length} nodes, ${totalDistance.toFixed(2)}m, ~${estimatedDuration}min`);

    return {
      path: coordinates,
      nodeIds: path,
      distance: totalDistance,
      duration: estimatedDuration,
      success: totalDistance !== Infinity
    };
  }

  /**
   * Find nearest node to given coordinates
   * @param {Array} targetCoords - [longitude, latitude]
   * @returns {string} Nearest node ID
   */
  findNearestNode(targetCoords) {
    let nearestNode = null;
    let minDistance = Infinity;

    this.nodes.forEach((node, nodeId) => {
      const distance = this.calculateDistance(targetCoords, node.coordinates);
      if (distance < minDistance) {
        minDistance = distance;
        nearestNode = nodeId;
      }
    });

    return nearestNode;
  }

  /**
   * Find node by block name/ID
   * @param {string} blockName - Block name to search for
   * @returns {string|null} Node ID or null if not found
   */
  findNodeByBlock(blockName) {
    for (const [nodeId, node] of this.nodes) {
      if (node.properties?.serves_block === blockName || 
          node.name.includes(blockName) ||
          node.properties?.block_id === blockName) {
        return nodeId;
      }
    }
    return null;
  }

  /**
   * Estimate walking time based on distance
   * @param {number} distance - Distance in meters
   * @returns {number} Estimated time in minutes
   */
  estimateWalkingTime(distance) {
    const walkingSpeedMps = 1.4; // Average walking speed: 1.4 m/s
    return Math.ceil(distance / walkingSpeedMps / 60);
  }

  /**
   * Get total number of edges in the graph
   * @returns {number} Total edges
   */
  getTotalEdges() {
    let totalEdges = 0;
    this.graph.forEach(edges => totalEdges += edges.length);
    return totalEdges / 2; // Divide by 2 since edges are bidirectional
  }

  /**
   * Get all reachable nodes from a given node
   * @param {string} nodeId - Starting node ID
   * @returns {Array} Array of reachable node IDs
   */
  getReachableNodes(nodeId) {
    const reachable = new Set();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (reachable.has(current)) continue;
      
      reachable.add(current);
      const neighbors = this.graph.get(current) || [];
      neighbors.forEach(({ to }) => {
        if (!reachable.has(to)) {
          queue.push(to);
        }
      });
    }

    return Array.from(reachable);
  }

  /**
   * Add a block access point to the graph
   * @param {string} nodeId - Node ID
   * @param {Object} nodeData - Node data including coordinates and connections
   */
  addBlockAccessPoint(nodeId, nodeData) {
    // Add node to the graph
    this.nodes.set(nodeId, {
      id: nodeId,
      name: nodeData.name,
      type: nodeData.type,
      coordinates: nodeData.coordinates,
      properties: nodeData
    });

    // Initialize adjacency list
    if (!this.graph.has(nodeId)) {
      this.graph.set(nodeId, []);
    }

    // Connect to specified nodes
    if (nodeData.connects_to && Array.isArray(nodeData.connects_to)) {
      nodeData.connects_to.forEach(connectedNodeId => {
        this.addEdge(nodeId, connectedNodeId);
      });
    }

    console.log(`✅ Added block access point: ${nodeId} -> ${nodeData.serves_block}`);
  }
}

// Export for use in Svelte components
export default CemeteryPathfinder;
