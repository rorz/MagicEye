document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('status-dot')!;
  const statusText = document.getElementById('status-text')!;
  const connectionText = document.getElementById('connection-text')!;
  const powerToggle = document.getElementById('power-toggle') as HTMLInputElement;
  const modeLabel = document.getElementById('mode-label')!;
  const slider = document.querySelector('.slider')!;
  const logoIcon = document.getElementById('logo-icon') as HTMLImageElement;

  let isConnected = false;
  let isInitialLoad = true;

  // Check connection status
  async function checkConnectionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'check_connection' });
      
      if (response && response.connected) {
        isConnected = true;
        
        // Update connection indicator based on toggle state
        if (powerToggle.checked) {
          statusDot.className = 'status-dot connected';
          connectionText.textContent = 'Connected';
          connectionText.className = 'connection-text connected';
        } else {
          // Don't show as connected when extension is OFF
          statusDot.className = 'status-dot disconnected';
          connectionText.textContent = 'Disabled';
          connectionText.className = 'connection-text';
        }
      } else {
        isConnected = false;
        statusDot.className = 'status-dot disconnected';
        connectionText.textContent = 'Not Connected';
        connectionText.className = 'connection-text';
      }
      
      // Update status text through the single source of truth
      updateToggleState(powerToggle.checked);
    } catch (error) {
      isConnected = false;
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Extension error';
      statusText.className = 'status-text';
    }
  }

  // Load saved state (default to ON)
  chrome.storage.local.get('extensionEnabled', (result) => {
    // Add no-transition class to prevent animation on load
    slider.classList.add('no-transition');
    
    // Default to true if not set
    const enabled = result.extensionEnabled !== false;
    powerToggle.checked = enabled;
    updateToggleState(enabled);
    
    // Remove no-transition class after a small delay
    setTimeout(() => {
      slider.classList.remove('no-transition');
      isInitialLoad = false;
    }, 50);
    
    // If first time, save the default
    if (result.extensionEnabled === undefined) {
      chrome.storage.local.set({ extensionEnabled: true });
    }
  });

  // Handle toggle change
  powerToggle.addEventListener('change', async () => {
    const enabled = powerToggle.checked;
    
    // Save state
    chrome.storage.local.set({ extensionEnabled: enabled });
    
    // Update UI immediately
    updateToggleState(enabled);
    
    // Send message to background to toggle extension
    const response = await chrome.runtime.sendMessage({ 
      type: 'TOGGLE_EXTENSION'
    });
    
    // Update connection status
    checkConnectionStatus();
  });

  function updateToggleState(enabled: boolean) {
    if (enabled) {
      modeLabel.textContent = 'ON';
      logoIcon.classList.remove('eye-closed');
      if (isConnected) {
        statusText.innerHTML = 'Ready to capture';
        statusText.className = 'status-text active';
      } else {
        statusText.textContent = 'Waiting for MCP server';
        statusText.className = 'status-text';
      }
    } else {
      modeLabel.textContent = 'OFF';
      logoIcon.classList.add('eye-closed');
      statusText.textContent = 'Extension disabled';
      statusText.className = 'status-text';
    }
  }

  // Initial status check
  checkConnectionStatus();
  
  // Recheck connection every 2 seconds
  setInterval(checkConnectionStatus, 2000);
});