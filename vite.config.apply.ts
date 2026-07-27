/**
 * 커맨드 적용 번들 (Node 용).
 *   npm run build:apply  →  tools/gen/apply-core.mjs
 *
 * 검사 번들(vite.config.audit.ts)과 목적이 다르다. 저쪽은 브라우저에서 재는 것이고
 * 이쪽은 Node 에서 문서를 고치는 것이라 형식(es)과 대상이 다르다.
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
    target: 'node20',
    outDir: 'tools/gen',
    emptyOutDir: false,
    ssr: true,
    lib: {
      entry: r('./src/core/apply-bundle.ts'),
      formats: ['es'],
      fileName: () => 'apply-core.mjs',
    },
  },
});
