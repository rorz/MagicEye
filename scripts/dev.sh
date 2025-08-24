#!/bin/bash

# Development helper for MagicEyes
echo "🔄 Starting MagicEyes development mode..."
echo ""
echo "This will:"
echo "• Watch and rebuild extension on changes"
echo "• Start the MCP server for testing"
echo ""

# Start extension build in watch mode
echo "👁️  Building extension in watch mode..."
pnpm run dev:extension &
BUILD_PID=$!

# Give build a moment to complete initial build
sleep 2

# Start the MCP server for testing
echo "🚀 Starting MCP server..."
node index.js --server &
SERVER_PID=$!

echo ""
echo "✅ Development mode active!"
echo ""
echo "Tips:"
echo "• Extension files: dist/extension/"
echo "• Reload extension in Chrome after changes"
echo "• Check Chrome DevTools console for debugging"
echo "• MCP server running on stdio"
echo "• Press Ctrl+C to stop everything"
echo ""

# Cleanup on exit
trap "kill $BUILD_PID $SERVER_PID 2>/dev/null" EXIT

# Wait for interrupt
wait