import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages project subpaths
  // (and any static host) without knowing the repo name.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
