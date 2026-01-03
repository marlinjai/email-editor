# Task: Fix CSS and Dependency issues in Next.js example

- [x] Research CSS and Dependency issues <!-- id: 0 -->
    - [x] List files and examine project structure <!-- id: 1 -->
    - [x] Check UI package exports for CSS <!-- id: 2 -->
    - [x] Check Next.js example configuration <!-- id: 3 -->
    - [x] Verify workspace linking and workspace dependencies <!-- id: 10 -->
- [/] Fix resolution and build issues <!-- id: 4 -->
    - [x] Create implementation plan <!-- id: 11 -->
    - [x] Add missing workspace dependencies to `examples/nextjs/package.json` <!-- id: 12 -->
    - [x] Fix broken `styles.css` export in `packages/editor/package.json` <!-- id: 6 -->
    - [x] Separate MJML compiler into subpath export in `packages/core` <!-- id: 13 -->
    - [x] Update Next.js API route to use new compiler import <!-- id: 14 -->
    - [x] Mark `mjml` as external package in `next.config.js` <!-- id: 15 -->
    - [x] Build all packages <!-- id: 5 -->
    - [x] Verify fix by running Next.js dev server <!-- id: 7 -->
- [x] Final verification <!-- id: 8 -->
    - [x] Confirm app loads without CSS or module resolution errors <!-- id: 9 -->
