import { WebSocketServer, WebSocket } from 'ws';
import type { ScreenshotRequest, ScreenshotResponse } from '../shared/types.js';

class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  private activeConnection: WebSocket | null = null;
  private messageQueue: Map<string, (response: ScreenshotResponse) => void> = new Map();
  private chunkBuffers: Map<string, { 
    chunks: (string | undefined)[], 
    totalChunks: number, 
    receivedChunks: number 
  }> = new Map();
  private messageId = 0;
  private connectionResolve: (() => void) | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPongReceived: number = Date.now();

  async connect(): Promise<void> {
    try {
      // Create WebSocket server on port 9559
      this.wss = new WebSocketServer({ port: 9559 });
      
      this.wss.on('connection', (ws) => {
        this.activeConnection = ws;
        this.lastPongReceived = Date.now();
        
        // Clear any existing ping interval
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
        }
        
        // Start heartbeat - ping every 20 seconds
        this.pingInterval = setInterval(() => {
          if (this.activeConnection && this.activeConnection.readyState === WebSocket.OPEN) {
            // Check if we've received a pong recently (within 40 seconds)
            if (Date.now() - this.lastPongReceived > 40000) {
              this.activeConnection.terminate();
              this.activeConnection = null;
              return;
            }
            
            // Send ping
            this.activeConnection.ping();
          }
        }, 20000);
        
        // Handle pong responses
        ws.on('pong', () => {
          this.lastPongReceived = Date.now();
        });
        
        // Handle incoming messages from extension
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            // Debug all incoming messages
            if (message.id) {
              console.log('Bridge received:', { 
                id: message.id, 
                type: message.type,
                hasData: !!message.data,
                chunkIndex: message.chunkIndex 
              });
            }
            
            // Handle special ping message (backup for native ping/pong)
            if (message.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
              this.lastPongReceived = Date.now();
              return;
            }
            
            // Handle chunked message types
            if (message.type === 'chunk_header' && message.id) {
              // Initialize chunk buffer
              console.log(`Starting chunked transfer for ${message.id}: ${message.totalChunks} chunks, ${message.totalSize} bytes`);
              this.chunkBuffers.set(message.id, {
                chunks: new Array(message.totalChunks),
                totalChunks: message.totalChunks,
                receivedChunks: 0
              });
              return;
            }
            
            if (message.type === 'chunk_data' && message.id) {
              // Store chunk
              const buffer = this.chunkBuffers.get(message.id);
              if (buffer) {
                buffer.chunks[message.chunkIndex] = message.data;
                buffer.receivedChunks++;
                
                if (buffer.receivedChunks % 10 === 0) {
                  console.log(`Received ${buffer.receivedChunks}/${buffer.totalChunks} chunks for ${message.id}`);
                }
              }
              return;
            }
            
            if (message.type === 'chunk_complete' && message.id) {
              // Reassemble chunks
              const buffer = this.chunkBuffers.get(message.id);
              if (buffer) {
                console.log(`Reassembling ${buffer.totalChunks} chunks for ${message.id}`);
                const fullData = buffer.chunks.join('');
                this.chunkBuffers.delete(message.id);
                
                // Call the original callback with reassembled data
                const callback = this.messageQueue.get(message.id);
                if (callback) {
                  console.log(`Calling callback for ${message.id} with reassembled screenshot (${fullData.length} bytes)`);
                  callback({
                    success: true,
                    data: { screenshot: fullData }
                  });
                } else {
                  console.error(`No callback found for ${message.id}!`);
                }
              }
              return;
            }
            
            // Handle regular (non-chunked) responses
            if (message.id && this.messageQueue.has(message.id)) {
              const callback = this.messageQueue.get(message.id);
              if (callback) {
                callback(message);
              }
            }
          } catch (error) {
          }
        });
        
        ws.on('close', () => {
          this.activeConnection = null;
          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }
        });
        
        ws.on('error', (error) => {
        });
      });
      
      this.wss.on('error', (error) => {
        // Don't crash, just log the error
      });
      
      // Don't block - server starts immediately
      return Promise.resolve();
      
    } catch (error) {
      // Still resolve to not block MCP server
      return Promise.resolve();
    }
  }

  async sendRequest(request: ScreenshotRequest): Promise<ScreenshotResponse> {
    const id = String(++this.messageId);
    
    return new Promise((resolve, reject) => {
      // Set timeout for response (longer for potential chunked transfers)
      const timeout = setTimeout(() => {
        this.messageQueue.delete(id);
        this.chunkBuffers.delete(id); // Clean up any incomplete chunks
        reject(new Error('Request timeout'));
      }, 60000); // 60 seconds for large screenshots

      // Store callback with timeout reference
      this.messageQueue.set(id, (response) => {
        clearTimeout(timeout);
        this.messageQueue.delete(id);
        this.chunkBuffers.delete(id); // Clean up any chunk buffers
        resolve(response);
      });

      // Check if extension is connected
      if (!this.activeConnection || this.activeConnection.readyState !== WebSocket.OPEN) {
        // Return error if no extension connected
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
      try {
        const message = { id, ...request };
        this.activeConnection.send(JSON.stringify(message));
      } catch (error) {
        clearTimeout(timeout);
        this.messageQueue.delete(id);
        reject(new Error('Failed to send message to extension'));
      }
    });
  }

  disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
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