import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-artifact',
    sourcemap: false,
    target: 'es2019',
    // Inline the music track as a data URI so the single-file build stays
    // fully self-contained (artifact hosting serves only the one HTML file).
    assetsInlineLimit: 4 * 1024 * 1024,
  },
});
