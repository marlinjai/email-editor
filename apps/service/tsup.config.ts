import { defineConfig } from 'tsup';

// One ESM bundle for Node 22. Dependencies stay external and are installed in
// the image by `pnpm deploy`; migrations ship next to dist/ as plain files.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
});
