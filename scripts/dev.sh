#!/bin/bash

# Quick development helper
echo "🔄 Starting development mode..."
echo ""
echo "This will:"
echo "• Watch and rebuild on changes"
echo "• Show server logs"
echo "• Auto-reload extension (manually refresh in Chrome)"
echo ""

# Start build in watch mode
pnpm run build -- --watch &
BUILD_PID=$!

# Start the server for testing
echo "Starting MCP server for testing..."
node dist/server/index.js &
SERVER_PID=$!

echo "✅ Development mode active!"
echo ""
echo "Tips:"
echo "• Refresh extension in Chrome after changes"
echo "• Check console in Chrome DevTools for debugging"
echo "• Press Ctrl+C to stop"
echo ""

# Cleanup on exit
trap "kill $BUILD_PID $SERVER_PID 2>/dev/null" EXIT

# Wait for interrupt
wait