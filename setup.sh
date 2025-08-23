#!/bin/bash

# Claude Code Vision - One-Click Setup
# This script automates the entire setup process

set -e

echo "🚀 Claude Code Vision - Automated Setup"
echo "======================================="
echo ""

# Check for required tools
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
}

echo "📋 Checking dependencies..."
check_command node
check_command pnpm

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pnpm install

# Build everything
echo ""
echo "🔨 Building extension and server..."
pnpm run build

# Create config directory if it doesn't exist
CONFIG_DIR="$HOME/.config/claude-desktop"
mkdir -p "$CONFIG_DIR"

# Get the current directory
CURRENT_DIR=$(pwd)

# Create or update Claude Desktop config
echo ""
echo "⚙️  Configuring Claude Desktop..."

CONFIG_FILE="$CONFIG_DIR/config.json"

if [ -f "$CONFIG_FILE" ]; then
    # Backup existing config
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    echo "   Backed up existing config to $CONFIG_FILE.backup"
    
    # Check if our server is already configured
    if grep -q "vision-server" "$CONFIG_FILE"; then
        echo "   Vision server already configured in Claude Desktop"
    else
        # Add our server to existing config
        node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
        if (!config.mcpServers) config.mcpServers = {};
        config.mcpServers['vision-server'] = {
            command: 'node',
            args: ['$CURRENT_DIR/dist/server/index.js']
        };
        fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
        console.log('   ✅ Added vision server to Claude Desktop config');
        "
    fi
else
    # Create new config
    cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "vision-server": {
      "command": "node",
      "args": ["$CURRENT_DIR/dist/server/index.js"]
    }
  }
}
EOF
    echo "   ✅ Created Claude Desktop config"
fi

# Load extension in Chrome
echo ""
echo "🌐 Opening Chrome to load extension..."
echo ""
echo "   Next steps:"
echo "   1. Chrome will open to the extensions page"
echo "   2. Click 'Load unpacked' button"
echo "   3. Select: $CURRENT_DIR/dist/extension"
echo "   4. The extension icon will appear in your toolbar"
echo ""
echo "   Press Enter to open Chrome..."
read

# Open Chrome extensions page
if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a "Google Chrome" "chrome://extensions"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    google-chrome "chrome://extensions" || chromium "chrome://extensions"
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "Quick test:"
echo "1. Take a screenshot (Cmd+Shift+4 on Mac)"
echo "2. Open Claude Desktop"
echo "3. Type: 'analyze this screenshot' and paste"
echo ""
echo "The extension will automatically capture and send the image to Claude!"