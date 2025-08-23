import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const target = args.includes('--target=extension') ? 'extension' : 
               args.includes('--target=server') ? 'server' : 'all';

async function buildExtension() {
  console.log('Building Chrome extension...');
  
  // Ensure dist directories exist
  mkdirSync('dist/extension', { recursive: true });
  
  // Build background script
  await esbuild.build({
    entryPoints: ['extension/background.ts'],
    bundle: true,
    outfile: 'dist/extension/background.js',
    platform: 'browser',
    target: 'chrome100',
    format: 'esm',
    sourcemap: true,
  });
  
  // Build content script
  await esbuild.build({
    entryPoints: ['extension/content.ts'],
    bundle: true,
    outfile: 'dist/extension/content.js',
    platform: 'browser',
    target: 'chrome100',
    format: 'iife',
    sourcemap: true,
  });

  // Build monitor script
  await esbuild.build({
    entryPoints: ['extension/monitor.ts'],
    bundle: true,
    outfile: 'dist/extension/monitor.js',
    platform: 'browser',
    target: 'chrome100',
    format: 'iife',
    sourcemap: true,
  });
  
  // Build popup script
  await esbuild.build({
    entryPoints: ['extension/popup.ts'],
    bundle: true,
    outfile: 'dist/extension/popup.js',
    platform: 'browser',
    target: 'chrome100',
    format: 'iife',
    sourcemap: true,
  });
  
  // Copy static files
  copyFileSync('extension/manifest.json', 'dist/extension/manifest.json');
  copyFileSync('extension/popup.html', 'dist/extension/popup.html');
  
  // Copy icon files
  const iconSizes = ['16', '48', '128'];
  for (const size of iconSizes) {
    const iconPath = `extension/icon-${size}.png`;
    const distIconPath = `dist/extension/icon-${size}.png`;
    if (existsSync(iconPath)) {
      copyFileSync(iconPath, distIconPath);
    } else {
      console.warn(`Warning: ${iconPath} not found. Run 'pnpm run generate-icons' to create icons.`);
    }
  }
  
  console.log('Extension build complete!');
}

async function buildServer() {
  console.log('Building MCP server...');
  
  mkdirSync('dist/server', { recursive: true });
  
  await esbuild.build({
    entryPoints: ['mcp-server/index.ts'],
    bundle: true,
    outfile: 'dist/server/index.js',
    platform: 'node',
    target: 'node18',
    format: 'esm',
    sourcemap: true,
    external: ['@modelcontextprotocol/sdk', 'ws'],
  });
  
  console.log('Server build complete!');
}

async function build() {
  try {
    if (target === 'extension' || target === 'all') {
      await buildExtension();
    }
    
    if (target === 'server' || target === 'all') {
      await buildServer();
    }
    
    if (watch) {
      console.log('Watching for changes...');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();