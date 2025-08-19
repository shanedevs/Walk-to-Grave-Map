// Cemetery Navigation System Test Suite
// This script tests the pathfinding from main entrance to various grave locations

import CemeteryPathfinder from './pathfinder.js';

export class NavigationTester {
  constructor() {
    this.pathfinder = new CemeteryPathfinder();
    this.testResults = [];
  }

  async initialize() {
    try {
      console.log('🧪 Initializing Navigation Test Suite...');
      
      // Load pathway data
      const response = await fetch('/src/lib/comprehensive-paths.geojson');
      const pathwayData = await response.json();
      
      // Build graph
      this.pathfinder.buildGraphFromGeoJSON(pathwayData);
      
      console.log('✅ Test system initialized');
      console.log(`📊 Graph: ${this.pathfinder.nodes.size} nodes, ${this.pathfinder.getTotalEdges()} edges`);
      
      return true;
    } catch (error) {
      console.error('❌ Test initialization failed:', error);
      return false;
    }
  }

  // Test navigation from main entrance to specific grave blocks
  async testNavigationToGraves() {
    console.log('\n🎯 Testing Navigation from Main Entrance to Graves...\n');

    const testCases = [
      {
        name: 'Phase 3 Block 5-Adult',
        expectedDestination: 'block_2_access',
        coordinates: [120.9753, 14.47096],
        description: 'Popular adult section'
      },
      {
        name: 'P2-14-Bone',
        expectedDestination: 'block_3_access', 
        coordinates: [120.9758, 14.47119],
        description: 'Bone/cremation section'
      },
      {
        name: 'Phase 2 Block 15-Adult',
        expectedDestination: 'block_11_access',
        coordinates: [120.976, 14.47176], 
        description: 'Phase 2 adult section'
      },
      {
        name: 'Office',
        expectedDestination: 'office_access',
        coordinates: [120.9767, 14.47266],
        description: 'Administrative office'
      },
      {
        name: 'C3-Child',
        expectedDestination: 'child_c3_access',
        coordinates: [120.9765, 14.47255],
        description: 'Children section'
      }
    ];

    const mainEntranceCoords = [120.9767, 14.4727];
    
    for (const testCase of testCases) {
      await this.runSingleNavigationTest(mainEntranceCoords, testCase);
    }

    this.printTestSummary();
  }

  async runSingleNavigationTest(startCoords, testCase) {
    try {
      console.log(`\n🧭 Testing route to: ${testCase.name}`);
      console.log(`📍 Target coordinates: [${testCase.coordinates.join(', ')}]`);
      
      // Find start and end nodes
      const startNodeId = this.pathfinder.findNearestNode(startCoords);
      const endNodeId = this.pathfinder.findNearestNode(testCase.coordinates);
      
      console.log(`🔍 Start node: ${startNodeId}`);
      console.log(`🔍 End node: ${endNodeId}`);
      
      // Calculate path
      const startTime = performance.now();
      const pathResult = this.pathfinder.findShortestPath(startNodeId, endNodeId);
      const endTime = performance.now();
      
      const testResult = {
        name: testCase.name,
        description: testCase.description,
        startNode: startNodeId,
        endNode: endNodeId,
        success: pathResult.success,
        distance: pathResult.distance,
        duration: pathResult.duration,
        pathLength: pathResult.path?.length || 0,
        calculationTime: endTime - startTime,
        route: pathResult.path?.map(p => p.name || p.nodeId) || []
      };

      if (pathResult.success) {
        console.log(`✅ Route found!`);
        console.log(`📏 Distance: ${pathResult.distance.toFixed(1)}m`);
        console.log(`⏱️ Walking time: ~${pathResult.duration} minutes`);
        console.log(`🔢 Path nodes: ${pathResult.path.length}`);
        console.log(`⚡ Calculation: ${(endTime - startTime).toFixed(2)}ms`);
        console.log(`🗺️ Route: ${testResult.route.join(' → ')}`);
        
        // Validate path makes sense
        this.validatePath(pathResult.path, testResult);
      } else {
        console.log(`❌ No route found`);
        testResult.error = 'No path found';
      }

      this.testResults.push(testResult);
      
    } catch (error) {
      console.error(`❌ Test failed for ${testCase.name}:`, error);
      this.testResults.push({
        name: testCase.name,
        success: false,
        error: error.message
      });
    }
  }

  validatePath(path, testResult) {
    // Check if path starts near entrance
    const firstNode = path[0];
    const lastNode = path[path.length - 1];
    
    console.log(`🔍 Path validation:`);
    console.log(`   Start: ${firstNode.name || firstNode.nodeId}`);
    console.log(`   End: ${lastNode.name || lastNode.nodeId}`);
    
    // Check for logical progression
    if (path.length < 2) {
      console.log(`⚠️ Very short path (${path.length} nodes)`);
    } else if (path.length > 10) {
      console.log(`⚠️ Very long path (${path.length} nodes) - might be inefficient`);
    } else {
      console.log(`✅ Path length looks reasonable (${path.length} nodes)`);
    }
  }

  // Test pathfinding performance with multiple scenarios
  async testPerformance() {
    console.log('\n⚡ Performance Testing...\n');

    const iterations = 100;
    const randomTests = [];
    
    // Generate random start/end points
    const nodeIds = Array.from(this.pathfinder.nodes.keys());
    
    for (let i = 0; i < iterations; i++) {
      const startId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      const endId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      
      if (startId !== endId) {
        randomTests.push({ startId, endId });
      }
    }

    console.log(`🔄 Running ${randomTests.length} random pathfinding tests...`);
    
    const startTime = performance.now();
    let successCount = 0;
    let totalDistance = 0;
    
    for (const test of randomTests) {
      const result = this.pathfinder.findShortestPath(test.startId, test.endId);
      if (result.success) {
        successCount++;
        totalDistance += result.distance;
      }
    }
    
    const endTime = performance.now();
    const avgTime = (endTime - startTime) / randomTests.length;
    const avgDistance = totalDistance / successCount;
    
    console.log(`📊 Performance Results:`);
    console.log(`   Success rate: ${((successCount / randomTests.length) * 100).toFixed(1)}%`);
    console.log(`   Average time: ${avgTime.toFixed(2)}ms per calculation`);
    console.log(`   Average distance: ${avgDistance.toFixed(1)}m`);
    console.log(`   Total time: ${(endTime - startTime).toFixed(2)}ms`);
  }

  // Visual demo - simulate walking from entrance to grave
  async demonstrateNavigation(targetGrave = 'Phase 3 Block 5-Adult') {
    console.log(`\n🎬 DEMO: Walking from Main Entrance to ${targetGrave}\n`);

    const mainEntranceCoords = [120.9767, 14.4727];
    
    // Find target coordinates from test cases
    const graveCoords = {
      'Phase 3 Block 5-Adult': [120.9753, 14.47096],
      'P2-14-Bone': [120.9758, 14.47119],
      'Office': [120.9767, 14.47266]
    }[targetGrave] || [120.9753, 14.47096];

    // Calculate route
    const startNodeId = this.pathfinder.findNearestNode(mainEntranceCoords);
    const endNodeId = this.pathfinder.findNearestNode(graveCoords);
    const pathResult = this.pathfinder.findShortestPath(startNodeId, endNodeId);

    if (!pathResult.success) {
      console.log('❌ Demo failed - no route found');
      return;
    }

    console.log(`🚶‍♂️ Walking Route to ${targetGrave}:`);
    console.log(`📏 Total distance: ${pathResult.distance.toFixed(1)}m`);
    console.log(`⏱️ Estimated time: ${pathResult.duration} minutes\n`);

    // Simulate step-by-step navigation
    for (let i = 0; i < pathResult.path.length; i++) {
      const step = pathResult.path[i];
      const nextStep = pathResult.path[i + 1];
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      
      if (i === 0) {
        console.log(`🚪 START: ${step.name || 'Main Entrance'}`);
      } else if (i === pathResult.path.length - 1) {
        console.log(`🎯 DESTINATION REACHED: ${targetGrave}`);
        console.log(`✅ Navigation complete!`);
      } else {
        const direction = this.getDirection(step, nextStep);
        console.log(`${i}. ${step.name || step.nodeId} ${direction}`);
      }
    }

    return pathResult;
  }

  getDirection(currentStep, nextStep) {
    if (!nextStep) return '';
    
    // Simple direction logic based on node types
    if (nextStep.type === 'junction') return '→ Continue to junction';
    if (nextStep.type === 'section_hub') return '→ Enter section';
    if (nextStep.type === 'block_access') return '→ Arrive at grave block';
    return '→ Continue forward';
  }

  printTestSummary() {
    console.log('\n📋 TEST SUMMARY\n');
    console.log('='.repeat(50));
    
    const successful = this.testResults.filter(r => r.success);
    const failed = this.testResults.filter(r => !r.success);
    
    console.log(`✅ Successful routes: ${successful.length}`);
    console.log(`❌ Failed routes: ${failed.length}`);
    console.log(`📊 Success rate: ${((successful.length / this.testResults.length) * 100).toFixed(1)}%`);
    
    if (successful.length > 0) {
      const avgDistance = successful.reduce((sum, r) => sum + r.distance, 0) / successful.length;
      const avgTime = successful.reduce((sum, r) => sum + r.calculationTime, 0) / successful.length;
      
      console.log(`📏 Average distance: ${avgDistance.toFixed(1)}m`);
      console.log(`⚡ Average calculation time: ${avgTime.toFixed(2)}ms`);
    }
    
    console.log('\n📝 Detailed Results:');
    this.testResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.name}: ${result.success ? '✅' : '❌'} ${result.success ? `(${result.distance.toFixed(1)}m)` : result.error || ''}`);
    });
    
    console.log('\n' + '='.repeat(50));
  }

  // Get comprehensive system statistics
  getSystemStats() {
    return {
      totalNodes: this.pathfinder.nodes.size,
      totalEdges: this.pathfinder.getTotalEdges(),
      testResults: this.testResults,
      nodeTypes: this.getNodeTypeBreakdown(),
      connectivity: this.testConnectivity()
    };
  }

  getNodeTypeBreakdown() {
    const breakdown = {};
    this.pathfinder.nodes.forEach(node => {
      const type = node.type || 'unknown';
      breakdown[type] = (breakdown[type] || 0) + 1;
    });
    return breakdown;
  }

  testConnectivity() {
    // Test if all nodes are reachable from main entrance
    const mainEntranceNode = 'main_entrance';
    if (!this.pathfinder.nodes.has(mainEntranceNode)) {
      return { error: 'Main entrance node not found' };
    }

    const reachableNodes = this.pathfinder.getReachableNodes(mainEntranceNode);
    const totalNodes = this.pathfinder.nodes.size;
    
    return {
      reachableFromEntrance: reachableNodes.length,
      totalNodes: totalNodes,
      connectivityPercent: ((reachableNodes.length / totalNodes) * 100).toFixed(1)
    };
  }
}

// Export for use in browser console or test files
export default NavigationTester;
