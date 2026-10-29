import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH: no GitHub Pages o site fica em /<repositorio>/; localmente, na raiz.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1500 },
});
