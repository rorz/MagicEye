# MagicEyess

**Give your code assistant eyes.**

Capture screenshots directly in your browser and share them instantly with AI coding assistants. Zero friction visual context.

## ✨ Install in 30 Seconds

```bash
npx magiceyess
```

That's it. The setup wizard will:
1. Guide you through Chrome extension installation
2. Configure Claude automatically (user scope)
3. Test the connection

## 🎯 How It Works

1. **Click** the MagicEyes icon in Chrome
2. **Capture** any webpage or element
3. **Ask** Claude "What do you see?"

Claude now has eyes. No file management. No manual configuration. It just works.

## 🚀 Features

- **Instant Screenshots** - Capture viewport, full page, or specific elements
- **Zero Config** - Uses `npx` so Claude always runs the latest version
- **User Scope** - Works across all your projects automatically
- **WebSocket Bridge** - Direct communication between browser and Claude
- **Privacy First** - Everything runs locally, no external servers

## 📦 What's Included

**Chrome Extension**
- Captures screenshots from any webpage
- WebSocket server for real-time communication
- Pin it for quick access

**MCP Server** 
- Runs via `npx` (no installation needed)
- Provides tools Claude can use:
  - `capture_screenshot` - Take a screenshot
  - `check_connection` - Verify extension is connected
  - `get_last_screenshot` - Retrieve recent capture

## 🛠️ Development

### Building the Chrome Extension

```bash
# Clone the repo
git clone https://github.com/rorz/MagicEyes.git
cd magiceye

# Install dependencies
pnpm install

# Build extension
pnpm run build:extension

# Extension will be in dist/extension/
```

### Testing Locally

```bash
# Test the setup flow
pnpm run test:setup

# Test the MCP server
pnpm run test:server

# Watch mode for development
pnpm run dev:extension
```

### Package for Chrome Web Store

```bash
pnpm run package:extension
# Creates magiceye-extension.zip
```

## 🏗️ Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│   Chrome    │ ◄────────────────► │  MCP Server  │
│  Extension  │     Port 9559      │   (npx)      │
└─────────────┘                    └──────────────┘
       ↓                                   ↑
   Captures                            Claude runs
  Screenshots                         on each start
```

**The Magic:** Claude's config uses `npx -y magiceyes --server`, so it always fetches and runs the latest version. No local installation needed.

## 🚀 Roadmap

### Now (v0.1)
- ✅ Claude Code support via MCP
- ✅ Chrome extension
- ✅ Single npm package
- ✅ Zero-config setup

### Next (v0.2)
- 🔜 Cursor integration
- 🔜 Element inspection mode
- 🔜 Capture history
- 🔜 Firefox support

### Future (v1.0)
- 📋 Codex support
- 📋 GitHub Copilot integration
- 📋 Video capture
- 📋 Network request inspection

## 🤝 Contributing

Contributions welcome! Please check out the [issues](https://github.com/rorz/MagicEyes/issues) page.

## 🔧 Troubleshooting

### Extension not connecting?
1. Make sure the extension is installed and pinned
2. Check that port 9559 is not blocked
3. Restart Claude Code after setup

### MCP server not working?
Run `npx magiceyes` again to reconfigure. Make sure to use `--scope user` if using Claude CLI manually.

### Manual Configuration
If automatic setup fails, add this to `~/.config/claude/mcp-settings.json`:
```json
{
  "mcpServers": {
    "magiceye": {
      "command": "npx",
      "args": ["-y", "magiceyes", "--server"]
    }
  }
}
```

## 📝 License

MIT © Rory

---

**Built for developers who show, don't tell.**

Give your AI the context it needs. Stop describing, start showing.