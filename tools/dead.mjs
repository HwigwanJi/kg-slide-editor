#!/usr/bin/env node
/**
 * 안 쓰이는 export 찾기.
 *
 * 왜 도구로 두는가 — 세어 보니 아무도 안 부르는 것이 13개 쌓여 있었다. 하나씩 보면
 * "혹시 쓸까 봐" 남긴 것들인데, 모이면 읽는 사람이 "이건 어디서 쓰나" 를 계속 확인하게 된다.
 * 조용히 쌓이는 종류라 손으로는 못 잡는다.
 *
 * 배럴(index.ts)은 통과 지점이라 참조처로 세지 않는다. 세면 전부 "쓰임" 으로 나온다.
 *
 *   npm run dead
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const norm = (p) => p.replace(/[\\]/g, '/');
const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = norm(join(d, e.name));
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
}('src'));
for (const f of readdirSync('tools')) if (/\.mjs$/.test(f) && !f.startsWith('.')) files.push(`tools/${f}`);

const src = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const isBarrel = (f) => /\/index\.ts$/.test(f);

const onlyExported = [];   // 밖에서 안 씀 · 안에서는 씀 → export 만 떼면 됨
const trulyDead = [];      // 밖에서도 안에서도 안 씀    → 지우면 됨

for (const [f, code] of src) {
  if (!f.startsWith('src') || isBarrel(f)) continue;
  const decl = /^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of code.matchAll(decl)) {
    const n = m[1];
    const pat = `\\b${n.replace(/\$/g, '\\$')}\\b`;
    let outside = false;
    for (const [g, c] of src) {
      if (g === f || isBarrel(g)) continue;
      if (new RegExp(pat).test(c)) { outside = true; break; }
    }
    if (outside) continue;
    const inside = (code.match(new RegExp(pat, 'g')) ?? []).length;  // 정의 1회 포함
    (inside > 1 ? onlyExported : trulyDead).push(`${f.replace('src/', '')} :: ${n}`);
  }
}

console.log(`아무도 안 부르는 것 ${trulyDead.length}개 — 지울 수 있음`);
for (const s of trulyDead) console.log(`   ${s}`);
console.log(`\n자기 파일 안에서만 쓰는 것 ${onlyExported.length}개 — export 만 떼면 됨`);
for (const s of onlyExported) console.log(`   ${s}`);
