// Cemetery On-Site Real-Time Navigation Component
// Specifically designed for actual cemetery field testing

import { RealTimeGPSNavigation } from './realtime-gps-navigation.js';
import { CemeteryPathfinder } from './pathfinder.js';

export class CemeteryOnSiteNavigation {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      // Field testing optimized settings
      arrivalThreshold: 3, // Very precise - 3 meters for cemetery accuracy
      waypointThreshold: 8, // 8 meters for waypoint progression  
      offRouteThreshold: 15, // 15 meters before considering off-route
      
      // GPS settings optimized for outdoor cemetery use
      enableHighAccuracy: true,
      maximumAge: 500, // Fresh GPS data every 0.5 seconds
      timeout: 10000, // 10 second timeout for GPS
      
      // Progress tracking for cemetery walking
      minProgressDistance: 1, // Count 1-meter movements
      stationaryTimeout: 45000, // 45 seconds before considering stationary
      
      // Update intervals for real-time feel
      positionUpdateInterval: 500, // Every 0.5 seconds
      navigationUpdateInterval: 250, // Every 0.25 seconds for smooth updates
      
      ...options
    };
    
    this.pathfinder = null;
    this.gpsNavigation = null;
    this.isInitialized = false;
    
    // UI elements
    this.statusDisplay = null;
    this.instructionDisplay = null;
    this.progressDisplay = null;
    this.debugDisplay = null;
    
    this.setupUI();
  }

  // Initialize the navigation system
  async initialize() {
    try {
      console.log('🏗️ Initializing cemetery on-site navigation...');
      
      // Load pathfinder
      this.pathfinder = new CemeteryPathfinder();
      await this.pathfinder.loadPathwayData();
      
      // Initialize GPS navigation with field-optimized settings
      this.gpsNavigation = new RealTimeGPSNavigation(this.options);
      
      // Set up event handlers
      this.setupEventHandlers();
      
      this.isInitialized = true;
      this.updateStatus('System ready for on-site testing', 'success');
      
      console.log('✅ On-site navigation system initialized');
      return true;
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.updateStatus(`Initialization failed: ${error.message}`, 'error');
      return false;
    }
  }

  // Start navigation to a specific grave or location
  async startNavigationTo(destinationCoords, destinationName = 'Destination') {
    try {
      if (!this.isInitialized) {
        throw new Error('System not initialized. Call initialize() first.');
      }

      this.updateStatus('Getting your current location...', 'info');
      
      // Get current position with high accuracy
      const currentPosition = await this.getCurrentPositionAccurate();
      const currentCoords = [currentPosition.longitude, currentPosition.latitude];
      
      this.updateStatus(`Starting navigation to ${destinationName}...`, 'info');
      
      // Start real-time navigation
      const result = await this.gpsNavigation.startRealTimeNavigation(
        currentCoords,
        destinationCoords,
        this.pathfinder
      );
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      this.updateStatus(`Navigation active to ${destinationName}`, 'navigating');
      this.updateInstruction('Follow the path ahead. GPS navigation is now active.');
      
      console.log('🧭 On-site navigation started successfully');
      
      return result;
      
    } catch (error) {
      console.error('❌ Navigation start failed:', error);
      this.updateStatus(`Navigation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  // Get high-accuracy current position
  getCurrentPositionAccurate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('GPS not supported on this device'));
        return;
      }
      
      const options = {
        enableHighAccuracy: true,
        maximumAge: 0, // Force fresh GPS reading
        timeout: 15000 // 15 second timeout for initial position
      };
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now()
          });
        },
        (error) => {
          const errorMessages = {
            1: 'GPS permission denied. Please enable location access.',
            2: 'GPS position unavailable. Are you outdoors with clear sky view?',
            3: 'GPS timeout. Please try again.'
          };
          reject(new Error(errorMessages[error.code] || 'GPS error'));
        },
        options
      );
    });
  }

  // Setup event handlers for GPS navigation
  setupEventHandlers() {
    // Location updates
    this.gpsNavigation.onLocationUpdate = (position) => {
      this.handleLocationUpdate(position);
    };
    
    // Navigation updates
    this.gpsNavigation.onNavigationUpdate = (update) => {
      this.handleNavigationUpdate(update);
    };
    
    // Waypoint reached
    this.gpsNavigation.onWaypointReached = (data) => {
      this.handleWaypointReached(data);
    };
    
    // Destination reached
    this.gpsNavigation.onDestinationReached = (data) => {
      this.handleDestinationReached(data);
    };
    
    // Off route
    this.gpsNavigation.onOffRoute = (data) => {
      this.handleOffRoute(data);
    };
    
    // Navigation errors
    this.gpsNavigation.onNavigationError = (error) => {
      this.handleNavigationError(error);
    };
  }

  // Handle GPS location updates
  handleLocationUpdate(position) {
    this.updateDebugInfo(`GPS: ${position.accuracy.toFixed(1)}m accuracy`);
    
    // Check GPS accuracy for cemetery navigation
    if (position.accuracy > 10) {
      this.updateStatus('GPS accuracy low. Move to open area for better signal.', 'warning');
    }
  }

  // Handle navigation updates
  handleNavigationUpdate(update) {
    // Update instruction
    this.updateInstruction(update.instruction);
    
    // Update progress
    const progressText = `
      Distance to waypoint: ${update.distanceToWaypoint.toFixed(1)}m
      Distance to destination: ${update.distanceToDestination.toFixed(1)}m
      Progress: ${update.waypointIndex + 1}/${update.totalWaypoints} waypoints
      ETA: ${Math.floor(update.estimatedTimeRemaining / 60)}:${(update.estimatedTimeRemaining % 60).toString().padStart(2, '0')}
    `;
    this.updateProgress(progressText);
    
    // Debug info
    this.updateDebugInfo(`
      Current: ${update.currentWaypoint.name || update.currentWaypoint.nodeId}
      Next: ${update.nextWaypoint ? (update.nextWaypoint.name || update.nextWaypoint.nodeId) : 'Destination'}
      Bearing: ${update.bearing ? update.bearing.toFixed(0) + '°' : 'N/A'}
      Traveled: ${update.totalDistanceTraveled.toFixed(1)}m
    `);
  }

  // Handle waypoint reached
  handleWaypointReached(data) {
    console.log(`🎯 Waypoint reached: ${data.waypoint.name}`);
    this.updateStatus(`Reached: ${data.waypoint.name || data.waypoint.nodeId}`, 'waypoint');
    
    // Provide haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
  }

  // Handle destination reached - Fix for "already arrived" issue
  handleDestinationReached(data) {
    console.log('🏁 Destination reached!');
    
    // Clear all active navigation states
    this.updateStatus('✅ You have arrived at your destination!', 'arrived');
    this.updateInstruction('Navigation complete. You have successfully reached your destination.');
    
    // Show completion summary
    const completionText = `
      🎉 Navigation Complete!
      
      Total distance traveled: ${data.totalDistanceTraveled.toFixed(1)}m
      Total time: ${Math.floor(data.totalTime / 60000)}:${((data.totalTime % 60000) / 1000).toFixed(0).padStart(2, '0')}
      
      Navigation has ended.
    `;
    this.updateProgress(completionText);
    
    // Provide success feedback
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
    
    // Show restart option
    this.showRestartOption();
  }

  // Handle going off route
  handleOffRoute(data) {
    console.log('⚠️ Off route detected');
    this.updateStatus('Off route - Recalculating path...', 'warning');
    this.updateInstruction('You\'ve gone off the planned route. Calculating new path to destination...');
    
    // Provide alert feedback
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }

  // Handle navigation errors
  handleNavigationError(error) {
    console.error('🚨 Navigation error:', error);
    this.updateStatus(`Error: ${error.message}`, 'error');
    
    // Provide error-specific guidance
    if (error.message.includes('GPS')) {
      this.updateInstruction('GPS issue detected. Please ensure you have a clear view of the sky and location permissions are enabled.');
    } else {
      this.updateInstruction('Navigation error occurred. Please restart navigation or contact support.');
    }
  }

  // Stop current navigation
  stopNavigation() {
    if (this.gpsNavigation) {
      this.gpsNavigation.stopNavigation();
    }
    
    this.updateStatus('Navigation stopped', 'stopped');
    this.updateInstruction('Navigation has been stopped. Tap "Start Navigation" to begin a new route.');
    this.updateProgress('');
    this.updateDebugInfo('');
  }

  // Setup UI elements
  setupUI() {
    this.container.innerHTML = `
      <div class="cemetery-navigation-ui">
        <div class="nav-header">
          <h2>🗺️ Cemetery Navigation</h2>
          <div class="nav-status" id="nav-status">Initializing...</div>
        </div>
        
        <div class="nav-instruction" id="nav-instruction">
          Welcome to cemetery navigation. Initialize the system to begin.
        </div>
        
        <div class="nav-progress" id="nav-progress"></div>
        
        <div class="nav-controls">
          <button id="init-btn" class="nav-btn primary">Initialize System</button>
          <button id="stop-btn" class="nav-btn secondary" disabled>Stop Navigation</button>
        </div>
        
        <div class="nav-quick-destinations">
          <h3>Quick Navigation</h3>
          <button class="nav-btn destination" data-coords="[120.9767, 14.4727]">Main Entrance</button>
          <button class="nav-btn destination" data-coords="[120.9753, 14.47096]">Phase 3 Block 5-Adult</button>
          <button class="nav-btn destination" data-coords="[120.9758, 14.47119]">P2-14-Bone</button>
          <button class="nav-btn destination" data-coords="[120.9767, 14.47266]">Cemetery Office</button>
        </div>
        
        <div class="nav-debug" id="nav-debug" style="display: none;">
          <h4>Debug Info</h4>
          <pre id="debug-info"></pre>
        </div>
        
        <div class="nav-toggle">
          <label>
            <input type="checkbox" id="debug-toggle"> Show Debug Info
          </label>
        </div>
      </div>
    `;
    
    // Get UI element references
    this.statusDisplay = this.container.querySelector('#nav-status');
    this.instructionDisplay = this.container.querySelector('#nav-instruction');
    this.progressDisplay = this.container.querySelector('#nav-progress');
    this.debugDisplay = this.container.querySelector('#nav-debug');
    
    // Setup event listeners
    this.setupUIEventListeners();
    
    // Add CSS styles
    this.addStyles();
  }

  // Setup UI event listeners
  setupUIEventListeners() {
    // Initialize button
    this.container.querySelector('#init-btn').addEventListener('click', async () => {
      await this.initialize();
    });
    
    // Stop button
    this.container.querySelector('#stop-btn').addEventListener('click', () => {
      this.stopNavigation();
    });
    
    // Destination buttons
    this.container.querySelectorAll('.destination').forEach(btn => {
      btn.addEventListener('click', async () => {
        const coords = JSON.parse(btn.dataset.coords);
        const name = btn.textContent;
        await this.startNavigationTo(coords, name);
      });
    });
    
    // Debug toggle
    this.container.querySelector('#debug-toggle').addEventListener('change', (e) => {
      this.debugDisplay.style.display = e.target.checked ? 'block' : 'none';
    });
  }

  // Update status display
  updateStatus(message, type = 'info') {
    if (this.statusDisplay) {
      this.statusDisplay.textContent = message;
      this.statusDisplay.className = `nav-status ${type}`;
    }
  }

  // Update instruction display
  updateInstruction(message) {
    if (this.instructionDisplay) {
      this.instructionDisplay.textContent = message;
    }
  }

  // Update progress display
  updateProgress(message) {
    if (this.progressDisplay) {
      this.progressDisplay.innerHTML = message.replace(/\n/g, '<br>');
    }
  }

  // Update debug info
  updateDebugInfo(message) {
    const debugInfo = this.container.querySelector('#debug-info');
    if (debugInfo) {
      debugInfo.textContent = message;
    }
  }

  // Show restart option after arrival
  showRestartOption() {
    const restartBtn = document.createElement('button');
    restartBtn.textContent = 'Start New Navigation';
    restartBtn.className = 'nav-btn primary';
    restartBtn.addEventListener('click', () => {
      this.stopNavigation();
      restartBtn.remove();
    });
    
    this.container.querySelector('.nav-controls').appendChild(restartBtn);
  }

  // Add CSS styles
  addStyles() {
    const styles = `
      <style>
      .cemetery-navigation-ui {
        font-family: Arial, sans-serif;
        max-width: 400px;
        margin: 0 auto;
        padding: 20px;
        background: #f5f5f5;
        border-radius: 10px;
      }
      
      .nav-header h2 {
        margin: 0 0 10px 0;
        text-align: center;
      }
      
      .nav-status {
        padding: 10px;
        border-radius: 5px;
        text-align: center;
        font-weight: bold;
        margin-bottom: 15px;
      }
      
      .nav-status.info { background: #e3f2fd; color: #1976d2; }
      .nav-status.success { background: #e8f5e8; color: #2e7d32; }
      .nav-status.warning { background: #fff3e0; color: #f57c00; }
      .nav-status.error { background: #ffebee; color: #d32f2f; }
      .nav-status.navigating { background: #e1f5fe; color: #0277bd; }
      .nav-status.waypoint { background: #f3e5f5; color: #7b1fa2; }
      .nav-status.arrived { background: #e8f5e8; color: #2e7d32; }
      .nav-status.stopped { background: #fafafa; color: #616161; }
      
      .nav-instruction {
        background: white;
        padding: 15px;
        border-radius: 5px;
        margin-bottom: 15px;
        border-left: 4px solid #2196f3;
      }
      
      .nav-progress {
        background: white;
        padding: 10px;
        border-radius: 5px;
        margin-bottom: 15px;
        font-family: monospace;
        font-size: 12px;
      }
      
      .nav-controls {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
      }
      
      .nav-btn {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
      }
      
      .nav-btn.primary {
        background: #2196f3;
        color: white;
      }
      
      .nav-btn.secondary {
        background: #757575;
        color: white;
      }
      
      .nav-btn:disabled {
        background: #cccccc;
        cursor: not-allowed;
      }
      
      .nav-quick-destinations {
        margin-bottom: 15px;
      }
      
      .nav-quick-destinations h3 {
        margin: 0 0 10px 0;
      }
      
      .nav-quick-destinations .nav-btn {
        display: block;
        width: 100%;
        margin-bottom: 5px;
        background: #4caf50;
        color: white;
      }
      
      .nav-debug {
        background: white;
        padding: 10px;
        border-radius: 5px;
        margin-bottom: 10px;
      }
      
      .nav-debug pre {
        margin: 0;
        font-size: 11px;
        white-space: pre-wrap;
      }
      
      .nav-toggle {
        text-align: center;
        font-size: 12px;
      }
      </style>
    `;
    
    if (!document.querySelector('#cemetery-nav-styles')) {
      const styleElement = document.createElement('div');
      styleElement.id = 'cemetery-nav-styles';
      styleElement.innerHTML = styles;
      document.head.appendChild(styleElement);
    }
  }
}

// Usage example for on-site testing
export function createOnSiteNavigationDemo(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with ID '${containerId}' not found`);
    return null;
  }
  
  const navigation = new CemeteryOnSiteNavigation(container, {
    // Field testing optimized settings
    arrivalThreshold: 3,
    waypointThreshold: 8,
    offRouteThreshold: 15,
    positionUpdateInterval: 500,
    navigationUpdateInterval: 250
  });
  
  return navigation;
}
