import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const target = args.find(arg => arg.startsWith('--target='))?.split('=')[1] || 'all';

async function buildExtension() {
  console.log('Building Chrome extension...');
  
  // Ensure dist directories exist
  mkdirSync('dist/extension', { recursive: true });
  
  const buildOptions = {
    bundle: true,
    platform: 'browser' as const,
    target: 'chrome100',
    sourcemap: true,
  };
  
  // Build background script
  await esbuild.build({
    ...buildOptions,
    entryPoints: ['extension/background.ts'],
    outfile: 'dist/extension/background.js',
    format: 'esm',
  });
  
  // Build content script
  await esbuild.build({
    ...buildOptions,
    entryPoints: ['extension/content.ts'],
    outfile: 'dist/extension/content.js',
    format: 'iife',
  });

  // Build monitor script
  await esbuild.build({
    ...buildOptions,
    entryPoints: ['extension/monitor.ts'],
    outfile: 'dist/extension/monitor.js',
    format: 'iife',
  });
  
  // Build popup script
  await esbuild.build({
    ...buildOptions,
    entryPoints: ['extension/popup.ts'],
    outfile: 'dist/extension/popup.js',
    format: 'iife',
  });
  
  // Copy static files
  copyFileSync('extension/manifest.json', 'dist/extension/manifest.json');
  copyFileSync('extension/popup.html', 'dist/extension/popup.html');
  copyFileSync('extension/icon-16.png', 'dist/extension/icon-16.png');
  copyFileSync('extension/icon-48.png', 'dist/extension/icon-48.png');
  copyFileSync('extension/icon-128.png', 'dist/extension/icon-128.png');
  
  console.log('Extension build complete!');
  
  if (watch) {
    console.log('Watching for changes...');
  }
}

async function buildMCPServer() {
  console.log('Building MCP server...');
  
  // Ensure dist directory exists
  mkdirSync('dist', { recursive: true });
  
  // Build the TypeScript MCP server to JavaScript
  await esbuild.build({
    entryPoints: ['mcp-server/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: 'dist/mcp-server.js',
    external: ['@modelcontextprotocol/sdk', 'ws'],
    sourcemap: true,
  });
  
  // Also build the bridge module
  await esbuild.build({
    entryPoints: ['mcp-server/bridge.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: 'dist/bridge.js',
    external: ['ws'],
    sourcemap: true,
  });
  
  console.log('MCP server build complete!');
}

// Run builds based on target
async function build() {
  try {
    if (target === 'extension') {
      await buildExtension();
    } else if (target === 'server') {
      await buildMCPServer();
    } else {
      // Build both
      await buildExtension();
      await buildMCPServer();
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();