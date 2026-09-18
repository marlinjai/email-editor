import { defineConfig } from 'tsup';

// One ESM bundle for Node 22. npm dependencies stay external and are installed
// in the image by `pnpm deploy`; the workspace's own API contract is bundled in,
// so the running service carries exactly the contract it was built against.
// Migrations ship next to dist/ as plain files.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@marlinjai/mail-contract'],
});
