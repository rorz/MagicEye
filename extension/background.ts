import type { ScreenshotRequest, ScreenshotResponse } from '../shared/types';

let ws: WebSocket | null = null;
let isConnected = false;
const messageQueue: Map<string, (response: ScreenshotResponse) => void> = new Map();
let reconnectDelay = 500; // Start with 500ms for faster initial connection
let reconnectTimer: number | null = null;
let pingInterval: number | null = null;
let keepAliveInterval: number | null = null;

// Keep service worker alive
function keepServiceWorkerAlive() {
  // Clear existing interval if any
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  
  // Ping the service worker every 20 seconds to prevent it from being suspended
  keepAliveInterval = setInterval(() => {
    // Simply accessing chrome API keeps the worker alive
    chrome.storage.local.get('keepAlive', () => {
      // Keep-alive ping
    });
  }, 20000) as unknown as number;
}

// Update extension icon based on enabled state
function updateExtensionIcon(enabled: boolean) {
  if (enabled) {
    // Eye open - normal icon
    chrome.action.setIcon({
      path: {
        "16": "icon-16.png",
        "48": "icon-48.png",
        "128": "icon-128.png"
      }
    });
  } else {
    // Eye closed - create grayscale version using canvas
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const img = new Image();
      img.onload = () => {
        // Draw the image
        ctx.drawImage(img, 0, 0, 128, 128);
        
        // Get image data and apply grayscale + darkening
        const imageData = ctx.getImageData(0, 0, 128, 128);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          // Convert to grayscale
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          // Apply darkening (30% brightness)
          const darkened = gray * 0.3;
          data[i] = darkened;     // Red
          data[i + 1] = darkened; // Green
          data[i + 2] = darkened; // Blue
          // Keep alpha channel unchanged
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Convert canvas to image data and set as icon
        canvas.convertToBlob().then(blob => {
          const reader = new FileReader();
          reader.onload = () => {
            chrome.action.setIcon({
              imageData: ctx.getImageData(0, 0, 128, 128)
            });
          };
          reader.readAsDataURL(blob);
        });
      };
      img.src = 'icon-128.png';
    }
  }
}

function connectToMCPServer() {
  try {
    // Clear any pending reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    ws = new WebSocket('ws://localhost:9559');
    
    ws.onopen = () => {
      isConnected = true;
      reconnectDelay = 500; // Reset delay on successful connection
      
      // Start keep-alive
      keepServiceWorkerAlive();
      
      // Start sending pings to server every 25 seconds
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000) as unknown as number;
      
      // Notify popup about connection status
      chrome.runtime.sendMessage({ type: 'connection_status', connected: true }).catch(() => {});
    };
    
    ws.onmessage = async (event) => {
      try {
        const request = JSON.parse(event.data);
        
        // Handle pong response
        if (request.type === 'pong') {
          return;
        }
        
        
        // Handle screenshot request from MCP server
        if (request.id && request.type) {
          // Special handling for large screenshots to avoid stack overflow
          if (request.type === 'capture_viewport' || request.type === 'capture_full_page') {
            try {
              const response = await handleScreenshotRequest(request);
              
              // Don't log huge screenshots
              if (response.data?.screenshot?.length > 1000000) {
                console.log('Extension sending response: Large screenshot', {
                  id: request.id,
                  success: response.success,
                  screenshotSizeMB: Math.round(response.data.screenshot.length / 1024 / 1024)
                });
              } else {
                console.log('Extension sending response:', {
                  id: request.id,
                  success: response.success,
                  hasData: !!response.data,
                  hasScreenshot: !!response.data?.screenshot,
                  screenshotSize: response.data?.screenshot?.length,
                  error: response.error
                });
              }
              
              // Send response back with the same ID
              if (ws && ws.readyState === WebSocket.OPEN) {
                // Check if we have a screenshot that might be large
                if (response.success && response.data?.screenshot) {
                  const screenshot = response.data.screenshot;
                  const CHUNK_SIZE = 256 * 1024; // 256KB chunks - small enough to stringify safely
                  
                  // If screenshot is large, chunk it
                  if (screenshot.length > CHUNK_SIZE) {
                    const totalChunks = Math.ceil(screenshot.length / CHUNK_SIZE);
                    console.log(`Chunking large screenshot: ${screenshot.length} bytes into ${totalChunks} chunks`);
                    
                    // Send header first
                    ws.send(JSON.stringify({
                      id: request.id,
                      type: 'chunk_header',
                      totalChunks: totalChunks,
                      totalSize: screenshot.length
                    }));
                    
                    // Send each chunk
                    for (let i = 0; i < totalChunks; i++) {
                      const start = i * CHUNK_SIZE;
                      const end = Math.min(start + CHUNK_SIZE, screenshot.length);
                      const chunk = screenshot.slice(start, end);
                      
                      // Send this chunk
                      ws.send(JSON.stringify({
                        id: request.id,
                        type: 'chunk_data',
                        chunkIndex: i,
                        data: chunk
                      }));
                    }
                    
                    // Send completion marker
                    ws.send(JSON.stringify({
                      id: request.id,
                      type: 'chunk_complete'
                    }));
                  } else {
                    // Small screenshot, send normally
                    ws.send(JSON.stringify({ id: request.id, ...response }));
                  }
                } else {
                  // Not a screenshot or error response
                  ws.send(JSON.stringify({ id: request.id, ...response }));
                }
              }
            } catch (error) {
              console.error('Screenshot handling error:', error);
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                  id: request.id, 
                  success: false, 
                  error: error instanceof Error ? error.message : 'Unknown error' 
                }));
              }
            }
          } else {
            // Non-screenshot requests
            const response = await handleScreenshotRequest(request);
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ id: request.id, ...response }));
            } else {
              console.error('WebSocket not open, cannot send response');
            }
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };
    
    ws.onclose = () => {
      isConnected = false;
      ws = null;
      
      // Clear intervals
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      
      chrome.runtime.sendMessage({ type: 'connection_status', connected: false }).catch(() => {});
      
      // Exponential backoff for reconnection (max 10 seconds for better responsiveness)
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      
      reconnectTimer = setTimeout(connectToMCPServer, reconnectDelay) as unknown as number;
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Connection will be retried in onclose handler
    };
  } catch (error) {
    console.error('Failed to connect to MCP server:', error);
    
    // Exponential backoff for reconnection (max 10 seconds)
    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
    console.log(`Reconnecting in ${reconnectDelay}ms...`);
    
    reconnectTimer = setTimeout(connectToMCPServer, reconnectDelay) as unknown as number;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  keepServiceWorkerAlive(); // Start keep-alive immediately
  connectToMCPServer();
});

chrome.runtime.onStartup.addListener(() => {
  keepServiceWorkerAlive(); // Start keep-alive immediately
  connectToMCPServer();
});

// Auto-capture queue for Claude
const captureHistory: any[] = [];
let autoCaptureEnabled = true; // Default to true

chrome.storage.local.get('autoCaptureEnabled', (result) => {
  // Default to true if not explicitly set to false
  autoCaptureEnabled = result.autoCaptureEnabled !== false;
  
  // Update icon based on initial state
  updateExtensionIcon(autoCaptureEnabled);
  
  // If first time, save the default
  if (result.autoCaptureEnabled === undefined) {
    chrome.storage.local.set({ autoCaptureEnabled: true });
  }
});

chrome.runtime.onMessage.addListener((request: ScreenshotRequest | { type: 'check_connection' | 'reconnect' | 'AUTO_CAPTURE' | 'GET_CAPTURE_HISTORY' | 'TOGGLE_AUTO_CAPTURE' }, sender, sendResponse) => {
  if (request.type === 'check_connection') {
    sendResponse({ connected: isConnected });
    return false;
  }
  
  if (request.type === 'reconnect') {
    // Reset reconnect delay for manual reconnection
    reconnectDelay = 500;
    
    // Clear any pending reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    // Close existing connection if any
    if (ws) {
      ws.close();
    }
    
    // Reconnect immediately
    connectToMCPServer();
    sendResponse({ success: true });
    return false;
  }

  if (request.type === 'AUTO_CAPTURE') {
    if (!autoCaptureEnabled) {
      sendResponse({ success: false, reason: 'Auto-capture disabled' });
      return false;
    }

    // Add to history
    const capture = {
      ...request,
      timestamp: Date.now(),
      tabId: sender.tab?.id
    };
    
    captureHistory.push(capture);
    if (captureHistory.length > 50) captureHistory.shift(); // Keep last 50

    // Auto-send to MCP if connected
    if (isConnected && ws) {
      // For auto-capture, ONLY use standard captureVisibleTab (no debugger!)
      // The tab that triggered this is already visible since user is interacting with it
      chrome.tabs.captureVisibleTab(sender.tab?.windowId, { format: 'png' })
        .then(screenshot => {
          const base64Data = screenshot.replace(/^data:image\/[a-z]+;base64,/, '');
          const enrichedCapture = {
            ...capture,
            screenshot: base64Data,
            success: true
          };
          
          // Send to MCP through WebSocket
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'auto_capture_event',
              data: enrichedCapture
            }));
          }
        })
        .catch(error => {
          // Silent fail for auto-capture - don't disrupt user
          console.log('Auto-capture skipped:', error.message);
        });
    }

    sendResponse({ success: true, queued: true });
    return false;
  }

  if (request.type === 'GET_CAPTURE_HISTORY') {
    sendResponse({ history: captureHistory });
    return false;
  }

  if (request.type === 'TOGGLE_AUTO_CAPTURE') {
    // Accept explicit enabled value or toggle
    if ('enabled' in request) {
      autoCaptureEnabled = request.enabled;
    } else {
      autoCaptureEnabled = !autoCaptureEnabled;
    }
    
    chrome.storage.local.set({ autoCaptureEnabled });
    
    // Update extension icon based on state
    updateExtensionIcon(autoCaptureEnabled);
    
    // Notify all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'UPDATE_MONITOR_CONFIG',
            config: { enabled: autoCaptureEnabled }
          }).catch(() => {});
        }
      });
    });
    
    sendResponse({ enabled: autoCaptureEnabled });
    return false;
  }
  
  // Handle local screenshot requests from popup
  handleScreenshotRequest(request as ScreenshotRequest).then(sendResponse);
  return true; // Keep the message channel open for async response
});

async function handleScreenshotRequest(request: ScreenshotRequest): Promise<ScreenshotResponse> {
  console.log('handleScreenshotRequest called with:', request);
  
  try {
    let targetTab;
    
    // If URL is provided, find that specific tab
    if (request.url) {
      // Find all tabs that match the URL (could be partial match)
      const allTabs = await chrome.tabs.query({});
      const matchingTabs = allTabs.filter(tab => {
        if (!tab.url) return false;
        
        const matches = 
          tab.url === request.url ||
          tab.url.startsWith(request.url) ||
          tab.url.startsWith(request.url.replace(/\/$/, '') + '/') ||
          (request.url.includes('localhost') && tab.url.includes(request.url.split('?')[0]));
        
        if (matches) {
          console.log(`Tab ${tab.id} matches: ${tab.url} matches ${request.url}`);
        }
        
        return matches;
      });
      
      if (matchingTabs.length > 0) {
        targetTab = matchingTabs[0];
        // We can now capture ANY tab, visible or not!
      } else {
        return { success: false, error: `No tab found with URL: ${request.url}` };
      }
    } else {
      // Use the currently active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTab = activeTab;
    }
    
    // Handle requests that don't need a target tab
    if (request.type === 'get_all_tabs') {
      const allTabs = await chrome.tabs.query({});
      const tabInfo = allTabs.map(tab => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active,
        windowId: tab.windowId
      }));
      return { success: true, data: { tabs: tabInfo } };
    }
    
    // For other requests, we need a target tab
    if (!targetTab || !targetTab.id) {
      return { success: false, error: 'No target tab found' };
    }

    switch (request.type) {
      case 'capture_viewport': {
        // Try to capture using debugger API for any tab (visible or not)
        try {
          // Detach any existing debugger first
          try {
            await chrome.debugger.detach({ tabId: targetTab.id });
          } catch (e) {
            // Ignore if not attached
          }
          
          // Attach debugger to the tab
          await chrome.debugger.attach({ tabId: targetTab.id }, '1.3');
          
          // Capture screenshot using debugger protocol - use WebP for efficiency
          const result = await chrome.debugger.sendCommand(
            { tabId: targetTab.id },
            'Page.captureScreenshot',
            { 
              format: 'webp',
              quality: 75 
            }
          );
          
          // Detach debugger immediately
          await chrome.debugger.detach({ tabId: targetTab.id });
          
          // Extract only the screenshot data, nothing else that could have circular refs
          const screenshotData = (result as any).data;
          if (typeof screenshotData !== 'string') {
            throw new Error('Invalid screenshot data received');
          }
          
          // Always return the same structure - chunking happens at the WebSocket layer
          return { success: true, data: { screenshot: screenshotData } };
        } catch (debuggerError) {
          console.error('Debugger capture failed:', debuggerError);
          
          // Fallback to regular capture if debugger fails (e.g., on chrome:// pages)
          try {
            const screenshot = await chrome.tabs.captureVisibleTab(
              targetTab.windowId,
              { format: request.format || 'png' }
            );
            const base64Data = screenshot.replace(/^data:image\/[a-z]+;base64,/, '');
            return { success: true, data: { screenshot: base64Data } };
          } catch (fallbackError) {
            console.error('Fallback capture also failed:', fallbackError);
            return { success: false, error: `Failed to capture screenshot: ${fallbackError.message || 'Unknown error'}` };
          }
        }
      }
      
      case 'capture_full_page': {
        // Try debugger API for full page capture
        try {
          await chrome.debugger.attach({ tabId: targetTab.id }, '1.3');
          
          // Get page metrics for full page capture
          const metrics = await chrome.debugger.sendCommand(
            { tabId: targetTab.id },
            'Page.getLayoutMetrics',
            {}
          );
          
          // Capture full page
          const result = await chrome.debugger.sendCommand(
            { tabId: targetTab.id },
            'Page.captureScreenshot',
            { 
              format: request.format || 'png',
              captureBeyondViewport: true,
              clip: {
                x: 0,
                y: 0,
                width: (metrics as any).cssContentSize.width,
                height: (metrics as any).cssContentSize.height,
                scale: 1
              }
            }
          );
          
          await chrome.debugger.detach({ tabId: targetTab.id });
          
          return { success: true, data: { screenshot: (result as any).data } };
        } catch (error) {
          // Fallback to viewport capture
          try {
            const screenshot = await chrome.tabs.captureVisibleTab(
              targetTab.windowId,
              { format: request.format || 'png' }
            );
            const base64Data = screenshot.replace(/^data:image\/[a-z]+;base64,/, '');
            return { success: true, data: { screenshot: base64Data } };
          } catch (fallbackError) {
            return { success: false, error: 'Failed to capture full page' };
          }
        }
      }
      
      
      case 'get_page_info': {
        // Check if this is a restricted URL
        if (targetTab.url && (targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://'))) {
          return { 
            success: false, 
            error: 'Cannot access chrome:// or extension pages due to browser security restrictions. Please navigate to a regular webpage.' 
          };
        }
        
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: getPageInfo
          });
          
          if (results && results[0]) {
            return { success: true, data: { pageInfo: results[0].result } };
          }
          return { success: false, error: 'Failed to get page info' };
        } catch (error) {
          if (error.message?.includes('Cannot access')) {
            return { 
              success: false, 
              error: 'Cannot access this page due to browser security restrictions. Please navigate to a regular webpage.' 
            };
          }
          return { success: false, error: `Failed to get page info: ${error.message}` };
        }
      }
      
      case 'get_page_source': {
        // Check if this is a restricted URL
        if (targetTab.url && (targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://'))) {
          return { 
            success: false, 
            error: 'Cannot access chrome:// or extension pages due to browser security restrictions. Please navigate to a regular webpage.' 
          };
        }
        
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: getPageSource
          });
          
          if (results && results[0]) {
            return { success: true, data: { source: results[0].result } };
          }
          return { success: false, error: 'Failed to get page source' };
        } catch (error) {
          if (error.message?.includes('Cannot access')) {
            return { 
              success: false, 
              error: 'Cannot access this page due to browser security restrictions. Please navigate to a regular webpage.' 
            };
          }
          return { success: false, error: `Failed to get page source: ${error.message}` };
        }
      }
      
      
      default:
        return { success: false, error: 'Unknown request type' };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Function to be injected for page info
function getPageInfo() {
  return {
    url: window.location.href,
    title: document.title,
    width: window.innerWidth,
    height: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth
  };
}

// Function to get full page source
function getPageSource() {
  return document.documentElement.outerHTML;
}

// Try to connect immediately when the background script loads
keepServiceWorkerAlive(); // Start keep-alive immediately on script load
connectToMCPServer();