import { defineConfig } from 'tsup';

// One ESM bundle for Node 22. npm dependencies stay external and are installed
// in the image by `pnpm deploy`; the workspace's own API contract is bundled in,
// so the running service carries exactly the contract it was built against.
// Migrations ship next to dist/ as plain files.
export default defineConfig({
  // The compile worker is its own entry: it runs in a worker thread, loaded by
  // path from next to main.js.
  entry: { main: 'src/main.ts', 'compile-worker': 'src/compile-worker.js' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@marlinjai/mail-contract'],
});
