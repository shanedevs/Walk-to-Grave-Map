#!/usr/bin/env node

// Simple Node.js test runner for cemetery navigation
// Run with: node test-runner.js

const fs = require('fs');
const path = require('path');

console.log('🗺️ Cemetery Navigation Test Runner\n');

// Mock performance.now() for Node.js
global.performance = {
  now: () => Date.now()
};

// Mock fetch for Node.js
global.fetch = async (url) => {
  const filePath = path.join(__dirname, 'comprehensive-paths.geojson');
  const data = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(data)
  };
};

// Simple pathfinder implementation for testing
class CemeteryPathfinder {
  constructor() {
    this.graph = new Map();
    this.nodes = new Map();
  }

  buildGraphFromGeoJSON(geoJsonData) {
    console.log('🏗️ Building navigation graph...');
    
    // Create nodes
    geoJsonData.features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const nodeId = feature.properties.id;
        this.nodes.set(nodeId, {
          id: nodeId,
          name: feature.properties.name,
          type: feature.properties.type,
          coordinates: feature.geometry.coordinates,
          properties: feature.properties
        });
        this.graph.set(nodeId, []);
      }
    });

    // Add connections
    this.nodes.forEach((node, nodeId) => {
      if (node.properties.connects_to) {
        node.properties.connects_to.forEach(connectedId => {
          this.addEdge(nodeId, connectedId);
        });
      }
    });

    console.log(`✅ Graph built: ${this.nodes.size} nodes, ${this.getTotalEdges()} edges`);
  }

  addEdge(nodeA, nodeB) {
    if (!this.nodes.has(nodeA) || !this.nodes.has(nodeB)) return;

    const coordsA = this.nodes.get(nodeA).coordinates;
    const coordsB = this.nodes.get(nodeB).coordinates;
    const distance = this.calculateDistance(coordsA, coordsB);

    this.graph.get(nodeA).push({ to: nodeB, weight: distance });
    this.graph.get(nodeB).push({ to: nodeA, weight: distance });
  }

  calculateDistance(coord1, coord2) {
    const toRad = (deg) => deg * (Math.PI / 180);
    const R = 6371000;

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

  findShortestPath(startNodeId, endNodeId) {
    if (!this.nodes.has(startNodeId) || !this.nodes.has(endNodeId)) {
      return { success: false, error: 'Start or end node not found' };
    }

    const distances = new Map();
    const previous = new Map();
    const visited = new Set();
    const priorityQueue = [];

    this.nodes.forEach((node, nodeId) => {
      distances.set(nodeId, nodeId === startNodeId ? 0 : Infinity);
    });

    priorityQueue.push({ nodeId: startNodeId, distance: 0 });

    while (priorityQueue.length > 0) {
      priorityQueue.sort((a, b) => a.distance - b.distance);
      const { nodeId: currentNode } = priorityQueue.shift();

      if (visited.has(currentNode)) continue;
      visited.add(currentNode);

      if (currentNode === endNodeId) break;

      const neighbors = this.graph.get(currentNode) || [];
      neighbors.forEach(({ to: neighbor, weight }) => {
        if (visited.has(neighbor)) return;

        const newDistance = distances.get(currentNode) + weight;
        if (newDistance < distances.get(neighbor)) {
          distances.set(neighbor, newDistance);
          previous.set(neighbor, currentNode);
          priorityQueue.push({ nodeId: neighbor, distance: newDistance });
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

    const totalDistance = distances.get(endNodeId);
    const estimatedDuration = Math.ceil(totalDistance / 1.4 / 60);

    return {
      path: path.map(nodeId => ({
        nodeId,
        coordinates: this.nodes.get(nodeId).coordinates,
        name: this.nodes.get(nodeId).name,
        type: this.nodes.get(nodeId).type
      })),
      distance: totalDistance,
      duration: estimatedDuration,
      success: totalDistance !== Infinity
    };
  }

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

  getTotalEdges() {
    let totalEdges = 0;
    this.graph.forEach(edges => totalEdges += edges.length);
    return totalEdges / 2;
  }
}

// Test runner
async function runTests() {
  try {
    console.log('🚀 Loading pathfinding system...');
    
    const pathfinder = new CemeteryPathfinder();
    const pathwayData = await fetch('./comprehensive-paths.geojson').then(r => r.json());
    
    pathfinder.buildGraphFromGeoJSON(pathwayData);
    
    console.log('\n🎯 Testing navigation routes...\n');
    
    const testCases = [
      {
        name: 'Main Entrance to Phase 3 Block 5-Adult',
        start: [120.9767, 14.4727],
        end: [120.9753, 14.47096]
      },
      {
        name: 'Main Entrance to P2-14-Bone',
        start: [120.9767, 14.4727],
        end: [120.9758, 14.47119]
      },
      {
        name: 'Main Entrance to Office',
        start: [120.9767, 14.4727],
        end: [120.9767, 14.47266]
      }
    ];

    let successCount = 0;
    
    for (const test of testCases) {
      console.log(`\n🧭 ${test.name}:`);
      
      const startNode = pathfinder.findNearestNode(test.start);
      const endNode = pathfinder.findNearestNode(test.end);
      
      const startTime = performance.now();
      const result = pathfinder.findShortestPath(startNode, endNode);
      const endTime = performance.now();
      
      if (result.success) {
        successCount++;
        console.log(`✅ Route found!`);
        console.log(`   Distance: ${result.distance.toFixed(1)}m`);
        console.log(`   Duration: ~${result.duration} minutes`);
        console.log(`   Calculation: ${(endTime - startTime).toFixed(2)}ms`);
        console.log(`   Path: ${result.path.slice(0, 3).map(p => p.name || p.nodeId).join(' → ')}...`);
      } else {
        console.log(`❌ No route found`);
      }
    }
    
    console.log(`\n📊 Test Results: ${successCount}/${testCases.length} successful (${((successCount/testCases.length)*100).toFixed(1)}%)`);
    console.log('\n🎉 Testing complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the tests
runTests();
