import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Which build this is: online players must run the same one, or their simulations drift apart. */
function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  // Relative asset paths so the build works under a GitHub Pages sub-path.
  base: './',
  build: { chunkSizeWarningLimit: 800 },
  define: { __BUILD__: JSON.stringify(buildId()) },
});
