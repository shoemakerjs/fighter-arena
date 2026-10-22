import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under a GitHub Pages sub-path.
  base: './',
  build: { chunkSizeWarningLimit: 800 },
});
