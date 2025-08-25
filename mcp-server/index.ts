#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { connectToExtension, sendScreenshotRequest } from './bridge.js';

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
const tools: Tool[] = [
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
    name: 'get_page_info',
    description: 'Get information about the current page (URL, title, dimensions)',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the tab to get info from (will switch to this tab automatically)'
        }
      }
    }
  },
  {
    name: 'get_page_source',
    description: 'Get the full HTML source of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the tab to get source from (will switch to this tab automatically)'
        }
      }
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
      case 'capture_viewport': {
        const response = await sendScreenshotRequest({
          type: 'capture_viewport',
          url: args?.url,
          format: 'webp'
        });
        
        if (response.success && response.data?.screenshot) {
          return {
            content: [
              {
                type: 'text',
                text: args?.url ? `📸 Captured from: ${args?.url}` : '📸 Captured from active tab'
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
          url: args?.url,
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
      
      case 'get_page_info': {
        const response = await sendScreenshotRequest({
          type: 'get_page_info',
          url: args?.url
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
          type: 'get_page_source',
          url: args?.url
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