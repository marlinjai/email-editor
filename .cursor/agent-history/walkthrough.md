# Build and CSS Fixes for Next.js Example

I've successfully resolved the build and CSS resolution issues in the Next.js example. The application now builds correctly and the dev server starts without errors.

## Changes Made

### 1. Workspace Dependency Resolution
The Next.js example was missing direct dependencies on the workspace packages it uses. I added them to `examples/nextjs/package.json`:
- `@returnhypnosis/email-editor-core`
- `@returnhypnosis/email-editor-ui`
- `@returnhypnosis/email-editor-blocks`

### 2. CSS Export Fix
The `@returnhypnosis/email-editor` package had a broken `./styles.css` export. I fixed this by:
- Adding a post-build step to `packages/editor/package.json` to copy the CSS from the UI package to the editor's `dist` folder.
- Re-enabling the `./styles.css` export in the `exports` map.

### 3. MJML Bundling and 'fs' Error Fix
The MJML library (which uses Node.js `fs`) was being bundled into the client-side code because it was exported from the core package's main entry point. I fixed this by:
- Separating the MJML compiler into a subpath export: `@returnhypnosis/email-editor-core/compiler`.
- Updating the Next.js API route to use this new subpath.
- Updating `EmailEditor` and `EmailEditorReact` to take the compiler as an optional prop, removing its direct usage from client-side paths.

### 4. Next.js 'EBADF' Build Error Fix
Next.js was hitting a "Bad File Descriptor" error during the build's page data collection phase when analyzing the MJML compiler. I resolved this by:
- Marking `mjml` and its sub-packages as external in `next.config.js`.
- Adding `export const dynamic = 'force-dynamic'` to the API route.

## Verification Results

### Build Status
All packages and the Next.js example now build successfully:
```bash
npx pnpm build
```
Result: `Tasks: 5 successful, 5 total`

### Dev Server
The Next.js dev server starts and compiles the home page successfully:
```bash
npx pnpm --filter email-editor-nextjs-example dev
```
Result: `✓ Compiled / in 1444ms (568 modules)`

## Next Steps
- You can now run the dev server and start using the email editor in the Next.js example.
- The editor will now correctly render the template (if the compiler is provided via an API route or server-side).

render_diffs(file:///Users/marlin.pohl/software%20development/email-editor/examples/nextjs/package.json)
render_diffs(file:///Users/marlin.pohl/software%20development/email-editor/packages/editor/package.json)
render_diffs(file:///Users/marlin.pohl/software%20development/email-editor/packages/core/package.json)
render_diffs(file:///Users/marlin.pohl/software%20development/email-editor/examples/nextjs/next.config.js)
