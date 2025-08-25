#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { connectToExtension, sendScreenshotRequest } from './bridge.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const server = new Server(
  {
    name: 'magiceyes',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
// Store the default URL for this session
let defaultTargetUrl: string | undefined;
let detectedDevServer: string | undefined;

// Detect running dev server from current project
function detectDevServer(): string | undefined {
  try {
    // Check for package.json in current directory
    const packageJsonPath = join(process.cwd(), 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      
      // Common patterns in scripts
      const scripts = packageJson.scripts || {};
      const devScript = scripts.dev || scripts.start || scripts['dev:local'] || '';
      
      // Extract port from scripts
      let port: number | undefined;
      
      // Next.js patterns
      if (devScript.includes('next dev')) {
        const portMatch = devScript.match(/-p\s+(\d+)|--port\s+(\d+)/);
        port = portMatch ? parseInt(portMatch[1] || portMatch[2]) : 3000; // Next.js defaults to 3000
      }
      // Vite/Nuxt patterns
      else if (devScript.includes('vite') || devScript.includes('nuxt')) {
        const portMatch = devScript.match(/--port\s+(\d+)/);
        port = portMatch ? parseInt(portMatch[1]) : 
               devScript.includes('nuxt') ? 3000 : 5173; // Nuxt defaults to 3000, Vite to 5173
      }
      // Create React App
      else if (devScript.includes('react-scripts')) {
        const portMatch = devScript.match(/PORT=(\d+)/);
        port = portMatch ? parseInt(portMatch[1]) : 3000;
      }
      // Generic port patterns
      else {
        const portMatch = devScript.match(/(?:PORT=|--port\s+|-p\s+)(\d+)/);
        port = portMatch ? parseInt(portMatch[1]) : undefined;
      }
      
      // Check environment variables
      if (!port && process.env.PORT) {
        port = parseInt(process.env.PORT);
      }
      
      // Check if a server is actually running on detected port
      if (port) {
        try {
          execSync(`curl -s http://localhost:${port} > /dev/null 2>&1`, { timeout: 1000 });
          return `http://localhost:${port}`;
        } catch {
          // Server not running on this port
        }
      }
      
      // Try common ports if no specific port found
      const commonPorts = [3000, 8080, 5173, 4200, 8000, 5000, 3001, 8081];
      for (const p of commonPorts) {
        try {
          execSync(`curl -s http://localhost:${p} > /dev/null 2>&1`, { timeout: 500 });
          return `http://localhost:${p}`;
        } catch {
          // Not running on this port
        }
      }
    }
  } catch (error) {
  }
  
  return undefined;
}

const tools: Tool[] = [
  {
    name: 'set_target_url',
    description: 'Set the default URL for all subsequent captures in this session',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to use as default for captures (e.g., http://localhost:3000)'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'capture_viewport',
    description: 'Capture a screenshot of the current browser viewport',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the tab to capture (will switch to this tab automatically)'
        }
      }
    }
  },
  {
    name: 'capture_full_page',
    description: 'Capture a screenshot of the entire scrollable page',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the tab to capture (will switch to this tab automatically)'
        }
      }
    }
  },
  {
    name: 'capture_element',
    description: 'Capture a screenshot of a specific element using CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to capture'
        },
        url: {
          type: 'string',
          description: 'URL of the tab to capture (will switch to this tab automatically)'
        },
        index: {
          type: 'number',
          description: 'Index of element if selector matches multiple (default: 0)',
          default: 0
        },
        padding: {
          type: 'number',
          description: 'Pixels of padding around the element (default: 0)',
          default: 0
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'get_page_info',
    description: 'Get information about the current page (URL, title, dimensions)',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_page_source',
    description: 'Get the full HTML source of the current page',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'capture_with_action',
    description: 'Capture before and after performing an action (click, type, etc)',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['click', 'type', 'hover', 'focus'],
          description: 'Action to perform'
        },
        selector: {
          type: 'string',
          description: 'Element selector to act on'
        },
        value: {
          type: 'string',
          description: 'Value for type action'
        },
        waitMs: {
          type: 'number',
          description: 'Milliseconds to wait after action (default: 1000)',
          default: 1000
        }
      },
      required: ['action', 'selector']
    }
  },
  {
    name: 'get_element_source',
    description: 'Get the HTML source of a specific element using CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element'
        },
        index: {
          type: 'number',
          description: 'Index of element if selector matches multiple (default: 0)',
          default: 0
        },
        includeChildren: {
          type: 'boolean',
          description: 'Include inner HTML (default: true)',
          default: true
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'get_all_tabs',
    description: 'Get a list of all open browser tabs with their URLs and titles',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'set_target_url': {
        defaultTargetUrl = args?.url;
        return {
          content: [
            {
              type: 'text',
              text: `Default capture URL set to: ${defaultTargetUrl}`
            }
          ]
        };
      }
      
      case 'capture_viewport': {
        // Smart URL detection
        let targetUrl = args?.url || defaultTargetUrl;
        
        // If no URL specified, try to detect dev server
        if (!targetUrl) {
          detectedDevServer = detectedDevServer || detectDevServer();
          targetUrl = detectedDevServer;
          
          if (targetUrl) {
          }
        }
        
        const response = await sendScreenshotRequest({
          type: 'capture_viewport',
          url: targetUrl,
          format: 'webp'
        });
        
        if (response.success && response.data?.screenshot) {
          return {
            content: [
              {
                type: 'text',
                text: targetUrl ? `📸 Captured from: ${targetUrl}` : '📸 Captured from active tab'
              },
              {
                type: 'image',
                data: response.data.screenshot,
                mimeType: 'image/webp' // Always WebP now
              }
            ]
          };
        } else {
          const errorDetails = [
            `Failed to capture viewport`,
            response.error ? `Extension error: ${response.error}` : '',
            !response.success ? `Success: false` : '',
            !response.data ? `No data returned` : '',
            response.data && !response.data.screenshot ? `Data exists but no screenshot` : ''
          ].filter(Boolean).join(' | ');
          
          throw new Error(errorDetails);
        }
      }
      
      case 'capture_full_page': {
        const response = await sendScreenshotRequest({
          type: 'capture_full_page',
          url: args?.url || defaultTargetUrl,  // Use provided URL or default
          format: 'webp'
        });
        
        if (response.success && response.data?.screenshot) {
          return {
            content: [
              {
                type: 'image',
                data: response.data.screenshot,
                mimeType: 'image/webp' // Always WebP now
              }
            ]
          };
        } else {
          throw new Error(response.error || 'Failed to capture full page');
        }
      }
      
      case 'capture_element': {
        const response = await sendScreenshotRequest({
          type: 'capture_element',
          selector: args?.selector,
          url: args?.url || defaultTargetUrl,  // Use provided URL or default
          index: args?.index || 0,
          padding: args?.padding || 0,
          format: 'webp'
        });
        
        if (response.success && response.data?.screenshot) {
          return {
            content: [
              {
                type: 'image',
                data: response.data.screenshot,
                mimeType: 'image/webp' // Always WebP now
              }
            ]
          };
        } else {
          throw new Error(response.error || 'Failed to capture element');
        }
      }
      
      case 'get_page_info': {
        const response = await sendScreenshotRequest({
          type: 'get_page_info'
        });
        
        if (response.success && response.data?.pageInfo) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data.pageInfo, null, 2)
              }
            ]
          };
        } else {
          throw new Error(response.error || 'Failed to get page info');
        }
      }
      
      case 'get_page_source': {
        const response = await sendScreenshotRequest({
          type: 'get_page_source'
        });
        
        if (response.success && response.data?.source) {
          return {
            content: [
              {
                type: 'text',
                text: response.data.source
              }
            ]
          };
        } else {
          throw new Error(response.error || 'Failed to get page source');
        }
      }
      
      case 'get_element_source': {
        const response = await sendScreenshotRequest({
          type: 'get_element_source',
          selector: args?.selector,
          index: args?.index || 0
        });
        
        if (response.success && response.data?.source) {
          return {
            content: [
              {
                type: 'text',
                text: response.data.source
              }
            ]
          };
        } else {
          throw new Error(response.error || 'Failed to get element source');
        }
      }
      
      case 'get_all_tabs': {
        const response = await sendScreenshotRequest({
          type: 'get_all_tabs'
        });
        
        if (response.success && response.data?.tabs) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data.tabs, null, 2)
              }
            ]
          };
        } else {
          throw new Error(response.error || 'Failed to get tabs list');
        }
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ],
      isError: true
    };
  }
});

async function main() {
  // Connect to Chrome extension via Native Messaging
  await connectToExtension();
  
  // Start the MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Simple startup message to stderr (shows in Claude)
}

main().catch((error) => {
  process.exit(1);
});