import { WebSocketServer, WebSocket } from 'ws';
import type { ScreenshotRequest, ScreenshotResponse } from '../shared/types.js';

class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  private activeConnection: WebSocket | null = null;
  private messageQueue: Map<string, (response: ScreenshotResponse) => void> = new Map();
  private messageId = 0;
  private connectionResolve: (() => void) | null = null;

  async connect(): Promise<void> {
    try {
      // Create WebSocket server on port 9559
      this.wss = new WebSocketServer({ port: 9559 });
      console.error('WebSocket server listening on ws://localhost:9559');
      
      this.wss.on('connection', (ws) => {
        console.error('Chrome extension connected via WebSocket');
        this.activeConnection = ws;
        
        // Handle incoming messages from extension
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.id && this.messageQueue.has(message.id)) {
              const callback = this.messageQueue.get(message.id);
              if (callback) {
                callback(message);
              }
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });
        
        ws.on('close', () => {
          console.error('Chrome extension disconnected');
          this.activeConnection = null;
        });
        
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
        });
      });
      
      this.wss.on('error', (error) => {
        console.error('WebSocket server error:', error);
        // Don't crash, just log the error
      });
      
      // Don't block - server starts immediately
      return Promise.resolve();
      
    } catch (error) {
      console.error('Failed to create WebSocket server:', error);
      // Still resolve to not block MCP server
      return Promise.resolve();
    }
  }

  async sendRequest(request: ScreenshotRequest): Promise<ScreenshotResponse> {
    const id = String(++this.messageId);
    
    return new Promise((resolve, reject) => {
      // Set timeout for response
      const timeout = setTimeout(() => {
        this.messageQueue.delete(id);
        reject(new Error('Request timeout'));
      }, 30000);

      // Store callback
      this.messageQueue.set(id, (response) => {
        clearTimeout(timeout);
        this.messageQueue.delete(id);
        resolve(response);
      });

      // Check if extension is connected
      if (!this.activeConnection || this.activeConnection.readyState !== WebSocket.OPEN) {
        // Return error if no extension connected
        console.error('Chrome extension not connected to WebSocket');
        setTimeout(() => {
          const callback = this.messageQueue.get(id);
          if (callback) {
            callback({
              success: false,
              error: 'Chrome extension not connected. Please ensure the extension is loaded and refresh the page you want to capture.'
            });
          }
        }, 100);
        return;
      }

      // Send request to extension
      const message = { id, ...request };
      this.activeConnection.send(JSON.stringify(message));
    });
  }

  disconnect(): void {
    if (this.activeConnection) {
      this.activeConnection.close();
      this.activeConnection = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.messageQueue.clear();
  }
}

const bridge = new ExtensionBridge();

export async function connectToExtension(): Promise<void> {
  return bridge.connect();
}

export async function sendScreenshotRequest(request: ScreenshotRequest): Promise<ScreenshotResponse> {
  return bridge.sendRequest(request);
}

export function disconnectFromExtension(): void {
  bridge.disconnect();
}