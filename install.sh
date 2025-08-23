#!/bin/bash

# Claude Code Vision - One-line installer
# Usage: curl -fsSL https://raw.githubusercontent.com/yourusername/claude-code-vision/main/install.sh | bash

set -e

echo "🚀 Installing Claude Code Vision..."

# Install from npm
npm install -g claude-code-vision

# The postinstall script will handle the rest
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Open Chrome and go to chrome://extensions"
echo "2. Enable 'Developer mode'"
echo "3. Click 'Load unpacked' and select: $(npm root -g)/claude-code-vision/dist/extension"
echo "4. Restart Claude Code"
echo ""
echo "The extension icon should appear in your Chrome toolbar!"