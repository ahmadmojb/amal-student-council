import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Stamps a unique build id into dist/sw.js so each deploy gets a fresh cache. */
function serviceWorkerVersion(): Plugin {
  return {
    name: 'amal-sw-version',
    apply: 'build',
    closeBundle() {
      const file = resolve(process.cwd(), 'dist/sw.js');
      const id = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_ID__', id));
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerVersion()],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
