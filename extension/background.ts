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
      console.log('Service worker keep-alive ping');
    });
  }, 20000) as unknown as number;
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
      console.log('Connected to MCP server via WebSocket');
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
          console.log('Sent ping to MCP server');
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
          console.log('Received pong from MCP server');
          return;
        }
        
        console.log('Received request from MCP:', request);
        
        // Handle screenshot request from MCP server
        if (request.id && request.type) {
          const response = await handleScreenshotRequest(request);
          // Send response back with the same ID
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ id: request.id, ...response }));
          } else {
            console.error('WebSocket not open, cannot send response');
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('Disconnected from MCP server');
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
      console.log(`Reconnecting in ${reconnectDelay}ms...`);
      
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
  console.log('MagicEyes extension installed');
  keepServiceWorkerAlive(); // Start keep-alive immediately
  connectToMCPServer();
});

chrome.runtime.onStartup.addListener(() => {
  keepServiceWorkerAlive(); // Start keep-alive immediately
  connectToMCPServer();
});

// Auto-capture queue for Claude
const captureHistory: any[] = [];
let autoCaptureEnabled = false;

chrome.storage.local.get('autoCaptureEnabled', (result) => {
  autoCaptureEnabled = result.autoCaptureEnabled || false;
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
      handleScreenshotRequest({ type: 'capture_viewport' }).then(result => {
        const enrichedCapture = {
          ...capture,
          screenshot: result.data?.screenshot,
          success: result.success
        };
        
        // Send to MCP through WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'auto_capture_event',
            data: enrichedCapture
          }));
        } else {
          console.log('WebSocket not open, skipping auto-capture send');
        }
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
    autoCaptureEnabled = !autoCaptureEnabled;
    chrome.storage.local.set({ autoCaptureEnabled });
    
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
  try {
    let targetTab;
    
    // If URL is provided, find that specific tab
    if (request.url) {
      // Find all tabs that match the URL (could be partial match)
      const allTabs = await chrome.tabs.query({});
      const matchingTabs = allTabs.filter(tab => 
        tab.url && (
          tab.url === request.url || 
          tab.url.startsWith(request.url) ||
          // Handle localhost with different ports
          (request.url.includes('localhost') && tab.url?.includes(request.url.split('?')[0]))
        )
      );
      
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
    
    if (!targetTab || !targetTab.id) {
      return { success: false, error: 'No target tab found' };
    }

    switch (request.type) {
      case 'capture_viewport': {
        // Try to capture using debugger API for any tab (visible or not)
        try {
          // Attach debugger to the tab
          await chrome.debugger.attach({ tabId: targetTab.id }, '1.3');
          
          // Capture screenshot using debugger protocol
          const result = await chrome.debugger.sendCommand(
            { tabId: targetTab.id },
            'Page.captureScreenshot',
            { format: request.format || 'png' }
          );
          
          // Detach debugger
          await chrome.debugger.detach({ tabId: targetTab.id });
          
          return { success: true, data: { screenshot: (result as any).data } };
        } catch (debuggerError) {
          console.warn('Debugger capture failed, falling back to visible tab capture:', debuggerError);
          
          // Fallback to regular capture if debugger fails (e.g., on chrome:// pages)
          try {
            const screenshot = await chrome.tabs.captureVisibleTab(
              targetTab.windowId,
              { format: request.format || 'png' }
            );
            const base64Data = screenshot.replace(/^data:image\/[a-z]+;base64,/, '');
            return { success: true, data: { screenshot: base64Data } };
          } catch (fallbackError) {
            return { success: false, error: 'Failed to capture screenshot' };
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
      
      case 'capture_element': {
        // Inject script to capture specific element
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: captureElement,
          args: [request.selector || 'body', request.index || 0, request.padding || 0]
        });
        
        if (results && results[0] && results[0].result) {
          const elementData = results[0].result;
          
          // Capture the visible area
          const screenshot = await chrome.tabs.captureVisibleTab(
            targetTab.windowId,
            { format: request.format || 'png' }
          );
          
          // Crop to element bounds
          // For now, return full viewport with element info
          // In production, we'd use canvas to crop
          const base64Data = screenshot.replace(/^data:image\/[a-z]+;base64,/, '');
          return { 
            success: true, 
            data: { 
              screenshot: base64Data,
              elementBounds: elementData
            } 
          };
        }
        return { success: false, error: 'Failed to capture element' };
      }
      
      case 'get_page_info': {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: getPageInfo
        });
        
        if (results && results[0]) {
          return { success: true, data: { pageInfo: results[0].result } };
        }
        return { success: false, error: 'Failed to get page info' };
      }
      
      case 'get_page_source': {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: getPageSource
        });
        
        if (results && results[0]) {
          return { success: true, data: { source: results[0].result } };
        }
        return { success: false, error: 'Failed to get page source' };
      }
      
      case 'get_element_source': {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: getElementSource,
          args: [request.selector || 'body', request.index || 0]
        });
        
        if (results && results[0]) {
          return { success: true, data: { source: results[0].result } };
        }
        return { success: false, error: 'Failed to get element source' };
      }
      
      default:
        return { success: false, error: 'Unknown request type' };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Function to be injected for element capture
function captureElement(selector: string, index: number, padding: number) {
  try {
    const elements = document.querySelectorAll(selector);
    if (!elements || elements.length === 0) {
      return null;
    }
    
    const element = elements[Math.min(index, elements.length - 1)] as HTMLElement;
    const rect = element.getBoundingClientRect();
    
    // Highlight the element temporarily
    const originalOutline = element.style.outline;
    element.style.outline = '3px solid #FF6B6B';
    
    setTimeout(() => {
      element.style.outline = originalOutline;
    }, 500);
    
    // Scroll element into view if needed
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    return {
      x: Math.max(0, rect.left - padding),
      y: Math.max(0, rect.top - padding),
      width: rect.width + (padding * 2),
      height: rect.height + (padding * 2),
      selector: selector,
      index: index
    };
  } catch (error) {
    console.error('Error capturing element:', error);
    return null;
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

// Function to get element source
function getElementSource(selector: string, index: number) {
  try {
    const elements = document.querySelectorAll(selector);
    if (!elements || elements.length === 0) {
      return `<!-- No elements found for selector: ${selector} -->`;
    }
    
    const element = elements[Math.min(index, elements.length - 1)] as HTMLElement;
    
    // Highlight briefly for visual feedback
    const originalOutline = element.style.outline;
    element.style.outline = '3px solid #00FF00';
    
    setTimeout(() => {
      element.style.outline = originalOutline;
    }, 500);
    
    return element.outerHTML;
  } catch (error) {
    return `<!-- Error getting element source: ${error} -->`;
  }
}

// Try to connect immediately when the background script loads
keepServiceWorkerAlive(); // Start keep-alive immediately on script load
connectToMCPServer();