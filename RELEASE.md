# Release Process

## Single Source of Truth

`package.json` version is the ONLY source. Everything else syncs from it.

## Bumping Version

```bash
# Patch (0.1.0 → 0.1.1)
pnpm version:bump

# Minor (0.1.0 → 0.2.0)  
pnpm version:minor

# Major (0.1.0 → 1.0.0)
pnpm version:major
```

These commands:
1. Update package.json version
2. Auto-sync to manifest.json and mcp-server
3. Create git tag

## Publishing

```bash
# NPM
pnpm publish

# Chrome Extension
pnpm run package:extension
# Upload to Chrome Web Store
```

## CI Check

GitHub Actions automatically verifies all versions match on every push.