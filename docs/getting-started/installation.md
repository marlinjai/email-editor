# Installation Instructions

## Prerequisites

This monorepo uses **pnpm** for workspace management. You need to install it first.

### Install pnpm

```bash
# Using npm
npm install -g pnpm

# Or using Homebrew (macOS)
brew install pnpm

# Or using curl
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

## Setup Steps

### 1. Install Dependencies

```bash
# From the monorepo root
pnpm install
```

This will install all dependencies for all packages.

### 2. Build All Packages

```bash
pnpm run build
```

This builds:
- `packages/core`
- `packages/ui`
- `packages/blocks`
- `packages/editor`

### 3. Run Example App

```bash
cd examples/nextjs
pnpm run dev
```

Open http://localhost:3000 to see the editor.

## Alternative: Use npm with Local Packages

If you prefer npm without workspaces:

1. Build each package individually:
   ```bash
   cd packages/core && npm install && npm run build
   cd ../ui && npm install && npm run build
   cd ../blocks && npm install && npm run build
   cd ../editor && npm install && npm run build
   ```

2. Link packages locally:
   ```bash
   cd packages/core && npm link
   cd ../ui && npm link @returnhypnosis/email-editor-core && npm link
   cd ../blocks && npm link @returnhypnosis/email-editor-core && npm link
   cd ../editor && npm link @returnhypnosis/email-editor-core @returnhypnosis/email-editor-ui @returnhypnosis/email-editor-blocks && npm link
   ```

3. Run example:
   ```bash
   cd examples/nextjs
   npm link @returnhypnosis/email-editor
   npm run dev
   ```

## Troubleshooting

### "Cannot find module" errors

Make sure all packages are built:
```bash
pnpm run build
```

### TypeScript errors

Clean and rebuild:
```bash
pnpm run clean
pnpm run build
```

### Port already in use

Change the port in `examples/nextjs`:
```bash
PORT=3001 pnpm run dev
```

## Development Workflow

### Watch Mode

For active development, run packages in watch mode:

```bash
# Terminal 1: Watch core package
cd packages/core
pnpm run dev

# Terminal 2: Watch ui package
cd packages/ui
pnpm run dev

# Terminal 3: Run example app
cd examples/nextjs
pnpm run dev
```

Changes will rebuild automatically.

### Running Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch
```

## Next Steps

Once installed, check out:

1. **[QUICKSTART.md](QUICKSTART.md)** - Quick overview
2. **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** - Detailed usage guide
3. **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development guide

