/**
 * 검사 번들 전용 빌드.
 *
 * 앱 번들과 따로 만든다. tools/lint.mjs 가 브라우저에 통째로 밀어 넣어야 해서
 * 모듈 로더 없이 바로 실행되는 형태(iife)여야 하기 때문이다.
 *   npm run build:audit  →  tools/gen/audit.iife.js
 */
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@contract': r('./src/contract'),
      '@core': r('./src/core'),
      '@adapters': r('./src/adapters'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'tools/gen',
    emptyOutDir: false,
    lib: {
      entry: r('./src/core/audit-bundle.ts'),
      formats: ['iife'],
      name: 'KGAudit',
      fileName: () => 'audit.iife.js',
    },
  },
});
