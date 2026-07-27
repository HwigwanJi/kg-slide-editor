import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — node 전용 도구라 타입 선언을 두지 않는다
import { kgfs } from './tools/vite-plugin-kgfs.mjs';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), kgfs()],
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
