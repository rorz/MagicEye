document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('status-dot')!;
  const statusText = document.getElementById('status-text')!;
  const connectionText = document.getElementById('connection-text')!;
  const powerToggle = document.getElementById('power-toggle') as HTMLInputElement;
  const modeLabel = document.getElementById('mode-label')!;
  const slider = document.querySelector('.slider')!;

  let isConnected = false;
  let isInitialLoad = true;

  // Check connection status
  async function checkConnectionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'check_connection' });
      
      if (response && response.connected) {
        isConnected = true;
        statusDot.className = 'status-dot connected';
        connectionText.textContent = 'Connected';
        connectionText.className = 'connection-text connected';
        
        // Update status text based on toggle state
        if (powerToggle.checked) {
          statusText.innerHTML = '<span>●</span> Monitoring page activity';
          statusText.className = 'status-text active';
        } else {
          statusText.innerHTML = 'Extension disabled';
          statusText.className = 'status-text';
        }
      } else {
        isConnected = false;
        statusDot.className = 'status-dot disconnected';
        connectionText.textContent = 'Not Connected';
        connectionText.className = 'connection-text';
        statusText.textContent = 'Waiting for MCP server';
        statusText.className = 'status-text';
      }
    } catch (error) {
      isConnected = false;
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Extension error';
      statusText.className = 'status-text';
    }
  }

  // Load saved state (default to ON for auto-mode)
  chrome.storage.local.get('autoCaptureEnabled', (result) => {
    // Add no-transition class to prevent animation on load
    slider.classList.add('no-transition');
    
    // Default to true if not set
    const enabled = result.autoCaptureEnabled !== false;
    powerToggle.checked = enabled;
    updateToggleState(enabled);
    
    // Remove no-transition class after a small delay
    setTimeout(() => {
      slider.classList.remove('no-transition');
      isInitialLoad = false;
    }, 50);
    
    // If first time, save the default
    if (result.autoCaptureEnabled === undefined) {
      chrome.storage.local.set({ autoCaptureEnabled: true });
      // Enable auto-capture by default
      chrome.runtime.sendMessage({ 
        type: 'TOGGLE_AUTO_CAPTURE',
        enabled: true 
      });
    }
  });

  // Handle toggle change
  powerToggle.addEventListener('change', async () => {
    const enabled = powerToggle.checked;
    
    // Save state
    chrome.storage.local.set({ autoCaptureEnabled: enabled });
    
    // Update UI immediately
    updateToggleState(enabled);
    
    // Send message to background
    const response = await chrome.runtime.sendMessage({ 
      type: 'TOGGLE_AUTO_CAPTURE',
      enabled: enabled
    });
    
    // Update connection status
    checkConnectionStatus();
  });

  function updateToggleState(enabled: boolean) {
    if (enabled) {
      modeLabel.textContent = 'AUTO';
      if (isConnected) {
        statusText.innerHTML = '<span>●</span> Monitoring page activity';
        statusText.className = 'status-text active';
      } else {
        statusText.textContent = 'Waiting for MCP server';
        statusText.className = 'status-text';
      }
    } else {
      modeLabel.textContent = 'OFF';
      statusText.textContent = 'Extension disabled';
      statusText.className = 'status-text';
    }
  }

  // Initial status check
  checkConnectionStatus();
  
  // Recheck connection every 2 seconds
  setInterval(checkConnectionStatus, 2000);
});