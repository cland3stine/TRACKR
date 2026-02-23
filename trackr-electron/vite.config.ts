import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  // Vite root = where index.html lives
  root: path.resolve(__dirname, 'src/renderer'),
  plugins: [react()],

  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    strictPort: true,
    // Proxy /api/* → http://127.0.0.1:8755/* (used by trackr-http-core.ts in DEV mode)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8755',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
