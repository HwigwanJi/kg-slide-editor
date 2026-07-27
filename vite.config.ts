import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@contract': r('./src/contract'),
      '@core': r('./src/core'),
      '@adapters': r('./src/adapters'),
    },
  },
  server: { port: 5180 },
  build: { target: 'es2022', outDir: 'dist' },
});
