document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status')!;
  const testButton = document.getElementById('test-capture') as HTMLButtonElement;
  const reconnectButton = document.getElementById('reconnect') as HTMLButtonElement;
  const viewHistoryButton = document.getElementById('view-history') as HTMLButtonElement;
  const autoToggle = document.getElementById('auto-capture-toggle') as HTMLInputElement;
  const autoStatus = document.getElementById('auto-status')!;
  const recording = document.getElementById('recording')!;
  const versionEl = document.getElementById('version')!;

  // Show version
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `Version ${manifest.version}`;

  // Check connection status
  checkConnectionStatus();

  // Test capture button
  testButton.addEventListener('click', async () => {
    testButton.disabled = true;
    testButton.textContent = 'Capturing...';
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'capture_viewport'
      });
      
      if (response.success) {
        testButton.textContent = 'Success! Check console';
        console.log('Screenshot captured:', response.data?.screenshot?.substring(0, 50) + '...');
      } else {
        testButton.textContent = 'Failed: ' + response.error;
      }
    } catch (error) {
      testButton.textContent = 'Error: ' + error;
    }
    
    setTimeout(() => {
      testButton.disabled = false;
      testButton.textContent = 'Test Screenshot Capture';
    }, 2000);
  });

  // Reconnect button
  reconnectButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'reconnect' });
    setTimeout(checkConnectionStatus, 1000);
  });

  // View history button
  viewHistoryButton.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CAPTURE_HISTORY' });
    console.log('Capture History:', response.history);
    alert(`${response.history?.length || 0} captures in history. Check console for details.`);
  });

  // Auto capture toggle
  chrome.storage.local.get('autoCaptureEnabled', (result) => {
    autoToggle.checked = result.autoCaptureEnabled || false;
    updateAutoStatus(result.autoCaptureEnabled || false);
  });

  autoToggle.addEventListener('change', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_AUTO_CAPTURE' });
    updateAutoStatus(response.enabled);
  });

  function updateAutoStatus(enabled: boolean) {
    if (enabled) {
      autoStatus.textContent = '🟢 ACTIVE - Monitoring all page events';
      autoStatus.className = 'auto-status active';
      recording.className = 'recording active';
    } else {
      autoStatus.textContent = 'Off - Manual capture only';
      autoStatus.className = 'auto-status';
      recording.className = 'recording';
    }
  }

  async function checkConnectionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'check_connection' });
      
      if (response && response.connected) {
        statusEl.className = 'status connected';
        statusEl.textContent = 'Connected to MCP Server';
      } else {
        statusEl.className = 'status disconnected';
        statusEl.textContent = 'Not connected to MCP Server';
      }
    } catch (error) {
      statusEl.className = 'status disconnected';
      statusEl.textContent = 'Extension error';
    }
  }
});