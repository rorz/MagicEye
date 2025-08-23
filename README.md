# Claude Code Vision 👁️

**Seamlessly share screenshots with Claude Desktop through a Chrome extension.**

## 🚀 Quick Start (2 minutes)

```bash
# Clone and setup everything automatically
git clone https://github.com/yourusername/claude-code-vision.git
cd claude-code-vision
./setup.sh
```

That's it! The script handles everything:
- ✅ Installs dependencies
- ✅ Builds the extension and server
- ✅ Configures Claude Desktop
- ✅ Opens Chrome to load the extension

## 🎯 How It Works

1. **Take a screenshot** (Cmd+Shift+4 on Mac, Windows+Shift+S on Windows)
2. **Open Claude Desktop** and mention the screenshot
3. **The extension automatically captures and sends it** to Claude

No manual uploading. No file management. Just natural conversation.

## 🛠️ Manual Setup

<details>
<summary>If you prefer manual setup or the script doesn't work...</summary>

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Chrome browser
- Claude Desktop app

### Steps

1. **Install and build**
```bash
pnpm install
pnpm run build
```

2. **Configure Claude Desktop**

Add to `~/.config/claude-desktop/config.json`:
```json
{
  "mcpServers": {
    "vision-server": {
      "command": "node",
      "args": ["/absolute/path/to/claude-code-vision/dist/server/index.js"]
    }
  }
}
```

3. **Load Chrome extension**
- Open `chrome://extensions`
- Enable "Developer mode"
- Click "Load unpacked"
- Select `dist/extension` folder

4. **Restart Claude Desktop**

</details>

## 💻 Development

```bash
# Start development mode with auto-rebuild
./scripts/dev.sh

# Or manually:
pnpm run build -- --watch
```

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Chrome    │────▶│ MCP Server   │────▶│   Claude     │
│  Extension  │     │  (Node.js)   │     │   Desktop    │
└─────────────┘     └──────────────┘     └──────────────┘
     Captures          Processes            Receives
   Screenshots          Images              Vision Data
```

- **Chrome Extension**: Monitors clipboard for screenshots
- **MCP Server**: Bridges extension and Claude Desktop
- **WebSocket**: Real-time communication between components

## 📝 Commands Reference

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm run build` | Build extension and server |
| `pnpm run build:extension` | Build Chrome extension only |
| `pnpm run build:server` | Build MCP server only |
| `./setup.sh` | Automated setup |
| `./scripts/dev.sh` | Start development mode |

## 🤔 Troubleshooting

**Extension not working?**
- Check Chrome DevTools console for errors
- Ensure extension is enabled in `chrome://extensions`

**Claude not receiving images?**
- Restart Claude Desktop after config changes
- Check server is in config: `cat ~/.config/claude-desktop/config.json`

**Build errors?**
- Ensure Node.js 18+ and pnpm are installed
- Try `pnpm install --force`

## License

MIT