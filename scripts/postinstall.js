#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = resolve(__dirname, '../dist/server/index.js');

console.log('\n🚀 Claude Code Vision Setup\n');

// Build if dist doesn't exist
if (!existsSync(serverPath)) {
  console.log('Building server...');
  execSync('pnpm run build:server', { stdio: 'inherit' });
}

// Check if claude CLI exists
try {
  execSync('which claude', { stdio: 'ignore' });
  
  console.log('Adding MCP server to Claude Code...');
  try {
    execSync(`claude mcp add claude-code-vision node ${serverPath}`, { stdio: 'inherit' });
    console.log('✅ MCP server added successfully!');
  } catch (e) {
    console.log('⚠️  Server might already be added. Run "claude mcp list" to check.');
  }
  
  console.log('\n📦 Next steps:');
  console.log('1. Install Chrome extension from: chrome://extensions');
  console.log('2. Load unpacked from:', resolve(__dirname, '../dist/extension'));
  console.log('3. Restart Claude Code');
  console.log('\n✨ Done! The extension icon should appear in your Chrome toolbar.\n');
} catch (error) {
  console.log('⚠️  Claude CLI not found. Manual setup required:');
  console.log(`\nRun: claude mcp add claude-code-vision node ${serverPath}`);
  console.log('\nOr install Claude Code first: https://claude.ai/code');
}