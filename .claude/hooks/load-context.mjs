#!/usr/bin/env node
/**
 * SessionStart 훅 — 작업 규칙을 세션마다 자동으로 불러온다.
 *
 * 규칙을 대화 컨텍스트에 기억시키지 않는다. 파일이 진실이고, 훅이 매번 읽어 넣는다.
 * 규칙을 바꾸려면 AGENTS.md 를 고친다.
 *
 * 덧붙여 값싼 정적 점검을 한 번 돌린다. 규칙을 적어 두기만 하면 지켜지지 않으므로,
 * 어기기 쉬운 두 가지(편집기 CSS의 리터럴 색상, 계약 타입 손선언)만 실제로 확인한다.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = [];

const agents = join(ROOT, 'AGENTS.md');
if (existsSync(agents)) {
  out.push(readFileSync(agents, 'utf8').trim());
} else {
  out.push('AGENTS.md 를 찾지 못함 — 작업 규칙 없이 진행 중.');
}

/* 현재 계약 버전 — 스키마 파일에서 직접 읽는다(문서에 적힌 숫자를 믿지 않는다) */
const schema = join(ROOT, 'src', 'contract', 'schema.ts');
if (existsSync(schema)) {
  const v = /CONTRACT_VERSION\s*=\s*(\d+)/.exec(readFileSync(schema, 'utf8'));
  if (v) out.push(`\n---\n\n현재 저장계약 버전: v${v[1]} (src/contract/schema.ts)`);
}

/* 규칙 위반 정적 점검 */
const problems = [];

const cssDir = join(ROOT, 'src', 'styles', 'editor');
if (existsSync(cssDir)) {
  for (const f of readdirSync(cssDir).filter((n) => n.endsWith('.css'))) {
    const text = readFileSync(join(cssDir, f), 'utf8');
    for (const [i, line] of text.split('\n').entries()) {
      if (line.trimStart().startsWith('/*') || line.trimStart().startsWith('*')) continue;
      if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(line)) {
        problems.push(`R5 위반 후보 — src/styles/editor/${f}:${i + 1} 리터럴 색상`);
      }
    }
  }
}

const contractDir = join(ROOT, 'src', 'contract');
if (existsSync(contractDir)) {
  const text = readFileSync(join(contractDir, 'schema.ts'), 'utf8');
  if (/^\s*export\s+interface\s+SlideDoc\b/m.test(text)) {
    problems.push('R1 위반 — SlideDoc 을 interface 로 손선언함. z.infer 로 파생해야 함');
  }
}

if (problems.length) {
  out.push(`\n### 점검 결과 (${problems.length}건)\n` + problems.map((p) => `- ${p}`).join('\n'));
}

process.stdout.write(out.join('\n') + '\n');
