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
    name: 'magiceye',
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
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp'],
          description: 'Image format (default: png)',
          default: 'png'
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
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp'],
          description: 'Image format (default: png)',
          default: 'png'
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
        index: {
          type: 'number',
          description: 'Index of element if selector matches multiple (default: 0)',
          default: 0
        },
        padding: {
          type: 'number',
          description: 'Pixels of padding around the element (default: 0)',
          default: 0
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp'],
          description: 'Image format (default: png)',
          default: 'png'
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
          format: args?.format || 'png'
        });
        
        if (response.success && response.data?.screenshot) {
          return {
            content: [
              {
                type: 'image',
                data: response.data.screenshot,
                mimeType: `image/${args?.format || 'png'}`
              }
            ]
          };
        } else {
          throw new Error(response.error || 'Failed to capture viewport');
        }
      }
      
      case 'capture_full_page': {
        const response = await sendScreenshotRequest({
          type: 'capture_full_page',
          format: args?.format || 'png'
        });
        
        if (response.success && response.data?.screenshot) {
          return {
            content: [
              {
                type: 'image',
                data: response.data.screenshot,
                mimeType: `image/${args?.format || 'png'}`
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
          index: args?.index || 0,
          padding: args?.padding || 0,
          format: args?.format || 'png'
        });
        
        if (response.success && response.data?.screenshot) {
          return {
            content: [
              {
                type: 'image',
                data: response.data.screenshot,
                mimeType: `image/${args?.format || 'png'}`
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
  
  console.error('MagicEye MCP server running');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});