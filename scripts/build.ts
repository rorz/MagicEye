import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const watch = args.includes('--watch');

async function buildExtension() {
  console.log('Building Chrome extension...');
  
  // Ensure dist directories exist
  mkdirSync('dist/extension', { recursive: true });
  
  const buildOptions = {
    bundle: true,
    platform: 'browser' as const,
    target: 'chrome100',
    sourcemap: true,
    watch: watch ? {
      onRebuild(error, result) {
        if (error) console.error('Watch build failed:', error);
        else console.log('Extension rebuilt');
      }
    } : false,
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

// Run build
buildExtension().catch(console.error);