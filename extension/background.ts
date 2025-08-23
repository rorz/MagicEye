import type { ScreenshotRequest, ScreenshotResponse } from '../shared/types';

let ws: WebSocket | null = null;
let isConnected = false;
const messageQueue: Map<string, (response: ScreenshotResponse) => void> = new Map();

function connectToMCPServer() {
  try {
    ws = new WebSocket('ws://localhost:9559');
    
    ws.onopen = () => {
      console.log('Connected to MCP server via WebSocket');
      isConnected = true;
      // Notify popup about connection status
      chrome.runtime.sendMessage({ type: 'connection_status', connected: true }).catch(() => {});
    };
    
    ws.onmessage = async (event) => {
      try {
        const request = JSON.parse(event.data);
        console.log('Received request from MCP:', request);
        
        // Handle screenshot request from MCP server
        if (request.id && request.type) {
          const response = await handleScreenshotRequest(request);
          // Send response back with the same ID
          ws?.send(JSON.stringify({ id: request.id, ...response }));
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('Disconnected from MCP server');
      isConnected = false;
      ws = null;
      chrome.runtime.sendMessage({ type: 'connection_status', connected: false }).catch(() => {});
      // Attempt to reconnect after 5 seconds
      setTimeout(connectToMCPServer, 5000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  } catch (error) {
    console.error('Failed to connect to MCP server:', error);
    setTimeout(connectToMCPServer, 5000);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Claude Code Vision extension installed');
  connectToMCPServer();
});

chrome.runtime.onStartup.addListener(() => {
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
    if (ws) {
      ws.close();
    }
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
        ws?.send(JSON.stringify({
          type: 'auto_capture_event',
          data: enrichedCapture
        }));
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
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab || !activeTab.id) {
      return { success: false, error: 'No active tab found' };
    }

    switch (request.type) {
      case 'capture_viewport': {
        const screenshot = await chrome.tabs.captureVisibleTab(
          activeTab.windowId,
          { format: request.format || 'png' }
        );
        // Remove data URL prefix to get pure base64
        const base64Data = screenshot.replace(/^data:image\/[a-z]+;base64,/, '');
        return { success: true, data: { screenshot: base64Data } };
      }
      
      case 'capture_full_page': {
        // For now, capture viewport as full page requires more complex implementation
        const screenshot = await chrome.tabs.captureVisibleTab(
          activeTab.windowId,
          { format: request.format || 'png' }
        );
        const base64Data = screenshot.replace(/^data:image\/[a-z]+;base64,/, '');
        return { success: true, data: { screenshot: base64Data } };
      }
      
      case 'capture_element': {
        // Inject script to capture specific element
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: captureElement,
          args: [request.selector || 'body', request.index || 0, request.padding || 0]
        });
        
        if (results && results[0] && results[0].result) {
          const elementData = results[0].result;
          
          // Capture the visible area
          const screenshot = await chrome.tabs.captureVisibleTab(
            activeTab.windowId,
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
          target: { tabId: activeTab.id },
          func: getPageInfo
        });
        
        if (results && results[0]) {
          return { success: true, data: { pageInfo: results[0].result } };
        }
        return { success: false, error: 'Failed to get page info' };
      }
      
      case 'get_page_source': {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: getPageSource
        });
        
        if (results && results[0]) {
          return { success: true, data: { source: results[0].result } };
        }
        return { success: false, error: 'Failed to get page source' };
      }
      
      case 'get_element_source': {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
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
connectToMCPServer();