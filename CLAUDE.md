# Project Instructions

## 🚨 CRITICAL: Extension/Server Updates

**WHENEVER you make changes that require:**
- Rebuilding the extension (`pnpm run build`)
- Reloading the Chrome extension 
- Restarting the MCP server

**YOU MUST:**
1. Clearly tell the user what needs to be done
2. WAIT for the user to confirm they've done it
3. Do NOT proceed with testing until confirmed

Example: "I've made changes to the extension. Please:
1. Run `pnpm run build`
2. Reload the extension in Chrome (chrome://extensions)
3. Let me know when done"

## 🎯 SUPREME DIRECTIVE: ELITE DX/UX

**Every single line of code, every decision, every feature MUST be evaluated through the lens of Developer & User Experience excellence.**

### Core Principles:
- **Zero-friction setup**: If it takes more than one command, it's too complex
- **Self-documenting**: The code should explain itself, the UI should guide itself
- **Fail gracefully**: Every error should suggest its own solution
- **Instant feedback**: Users should never wonder if something worked
- **Progressive disclosure**: Simple things simple, complex things possible
- **Delight through details**: The small touches that make developers smile

### Practical Application:
- Installation should be ONE command with automatic everything
- Errors should include copy-paste solutions
- State should be visually obvious (connected/disconnected/processing)
- Every action should have immediate, clear feedback
- Documentation should be unnecessary because the UX is that good

---

**IMPORTANT: Always use `pnpm` for package management in this project, not `npm` or `yarn`.**

- Use `pnpm install` to install dependencies
- Use `pnpm run build` to build the project
- Use `pnpm run dev` for development
- Use `pnpm test` for testing
- All package operations should use `pnpm`