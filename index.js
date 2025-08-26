#!/usr/bin/env node

/**
 * MagicEyes - Single package for both CLI and MCP server
 * 
 * Usage:
 *   npx magiceyes          → Run setup wizard
 *   npx magiceyes --server → Run as MCP server (for Claude)
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'fs';
import { homedir } from 'os';
import readline from 'readline';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if running as MCP server
const args = process.argv.slice(2);

if (args.includes('--server') || args.includes('server')) {
  // Run MCP server (use the built TypeScript version with all features)
  import('./dist/mcp-server.js');
} else if (args[0] === 'uninstall') {
  // Uninstall command
  console.log('🧹 Uninstalling MagicEyes...\n');
  
  const configPath = join(homedir(), '.config', 'claude', 'mcp-settings.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      if (config.mcpServers?.magiceyes) {
        delete config.mcpServers.magiceyes;
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('✅ Removed from Claude config');
      }
    } catch {}
  }
  
  console.log('\nTo remove the Chrome extension:');
  console.log('1. Go to chrome://extensions');
  console.log('2. Find MagicEyes and click Remove\n');
} else {
  // Run setup wizard
  runSetup();
}

async function runSetup() {
  const configPath = join(homedir(), '.config', 'claude', 'mcp-settings.json');
  let targetPath = ''; // Store extension path for later reference
  
  console.clear();
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║             MagicEyes Alpha 🪄 👀 ✨ (Pre-release)        ║    
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  console.log('🚀 Welcome to MagicEyes Alpha!\n');
  console.log('The Chrome extension is not yet published on the Web Store.');
  console.log('This setup will install it locally for you.\n');

  console.log('Step 1: Install Chrome Extension');
  console.log('────────────────────────────────\n');
  
  // Ask where to install the extension
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const extensionPath = await new Promise((resolve) => {
    const defaultPath = join(homedir(), 'magiceyes-extension');
    rl.question(`Where would you like to install the extension?\n(default: ${defaultPath}): `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultPath);
    });
  });

  // Copy extension files
  const sourcePath = join(__dirname, 'dist', 'extension');
  targetPath = resolve(extensionPath);
  
  console.log(`\n📦 Installing extension to: ${targetPath}`);
  
  try {
    // Create target directory if it doesn't exist
    mkdirSync(targetPath, { recursive: true });
    
    // Copy all extension files
    if (existsSync(sourcePath)) {
      cpSync(sourcePath, targetPath, { recursive: true });
      console.log('✅ Extension files copied successfully\n');
    } else {
      console.log('⚠️  Extension files not found in package. Building from source...');
      // If running from source, build first
      try {
        execSync('pnpm run build', { cwd: __dirname, stdio: 'ignore' });
        if (existsSync(sourcePath)) {
          cpSync(sourcePath, targetPath, { recursive: true });
          console.log('✅ Extension built and copied successfully\n');
        } else {
          throw new Error('Build completed but extension files still not found');
        }
      } catch (buildError) {
        console.error('❌ Failed to build extension:', buildError.message);
        console.log('\nPlease build manually with: pnpm run build');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('❌ Failed to copy extension files:', error.message);
    process.exit(1);
  }

  console.log('📝 Now install the extension in Chrome:');
  console.log('────────────────────────────────────────');
  console.log(`1. Open chrome://extensions (opening now...)`);
  console.log('2. Enable "Developer mode" (top right toggle)');
  console.log('3. Click "Load unpacked"');
  console.log(`4. Select: ${targetPath}`);
  console.log('5. Pin the MagicEyes extension for easy access\n');

  // Try to open Chrome extensions page
  openURL('chrome://extensions');

  await waitForKeypress('\nPress ENTER after installing the extension...');

  console.log('\nStep 2: Configure Claude');
  console.log('────────────────────────────');
  
  // Try using Claude CLI first (preferred method)
  let configSuccess = false;
  
  try {
    // Check if Claude CLI exists
    execSync('which claude', { stdio: 'ignore' });
    
    process.stdout.write('Adding MagicEyes to Claude (user scope)... ');
    
    // Use Claude CLI with --scope user flag
    execSync('claude mcp add magiceyes --scope user -- npx -y magiceyes --server', { 
      stdio: 'ignore' 
    });
    
    console.log('✅');
    console.log('\n📝 Added to Claude config (user scope):');
    console.log('   Command: npx -y magiceyes --server');
    console.log('   This will auto-download and run the MCP server\n');
    
    configSuccess = true;
  } catch {
    // Claude CLI not available, fall back to manual config
    try {
      process.stdout.write('Claude CLI not found. Adding manually... ');
      
      // Ensure directory exists
      mkdirSync(dirname(configPath), { recursive: true });
      
      let config = { mcpServers: {} };
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, 'utf8');
        try {
          config = JSON.parse(content);
          if (!config.mcpServers) config.mcpServers = {};
        } catch {}
      }
      
      // Add our server with npx command
      config.mcpServers['magiceyes'] = {
        command: "npx",
        args: ["-y", "magiceyes", "--server"]
      };
      
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('✅');
      
      console.log('\n📝 Added to Claude config (user scope):');
      console.log('   Command: npx -y magiceyes --server');
      console.log('   Location: ~/.config/claude/mcp-settings.json');
      console.log('   This will auto-download and run the MCP server\n');
      
      configSuccess = true;
    } catch (error) {
      console.log('❌');
      console.log(`Error: ${error.message}`);
    }
  }
  
  if (configSuccess) {
    
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              ✨  Alpha Setup Complete!  ✨                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

  🎯 Final Step:
  ─────────────
  Restart Claude Code (Cmd+Q / Alt+F4, then reopen)

  🚀 How to Use:
  ─────────────
  1. Click MagicEyes icon in Chrome toolbar
  2. Navigate to any webpage
  3. Capture viewport or full page
  4. Ask Claude "What do you see?"

  📍 Extension Location: ${targetPath}
  
  ⚡ Claude now has eyes! Welcome to the alpha! 👁️
    `);
  } else {
    console.log('\n❌ Setup failed. Please try manual configuration:');
    console.log('Add this to ~/.config/claude/mcp-settings.json:');
    console.log(JSON.stringify({
      mcpServers: {
        magiceyes: {
          command: "npx",
          args: ["-y", "magiceyes", "--server"]
        }
      }
    }, null, 2));
  }
}

function openURL(url) {
  const platform = process.platform;
  const commands = {
    darwin: `open "${url}"`,
    win32: `start "${url}"`,
    linux: `xdg-open "${url}"`
  };
  
  try {
    execSync(commands[platform] || commands.linux, { stdio: 'ignore' });
  } catch {
    console.log(`Please open: ${url}`);
  }
}

function waitForKeypress(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}