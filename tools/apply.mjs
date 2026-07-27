#!/usr/bin/env node
/**
 * 커맨드 적용 — AI 가 장표를 고치는 통로.
 *
 * 왜 필요한가: 장표를 HTML 로 다시 그리면 노드 경로가 어긋나 사람이 쌓아 둔 편집분이
 * 전부 무효가 된다. 30분 다듬은 결과가 한 번의 재작도로 사라진다.
 * 그래서 AI 는 원본을 다시 그리지 않고 커맨드만 발행한다. (docs/DECISIONS.md D2)
 *
 * 사용법
 *   node tools/apply.mjs <slide.kgslide> --cmds <commands.json>
 *   node tools/apply.mjs <slide.kgslide> --cmds -            # 표준입력
 *   node tools/apply.mjs <slide.kgslide> --dry               # 적용하지 않고 결과만
 *   node tools/apply.mjs --vocab                             # 쓸 수 있는 커맨드 목록
 *
 * commands.json 은 커맨드 배열이다.
 *   [{"type":"setText","id":"n.2.1.0","html":"바꿀 <b>내용</b>"},
 *    {"type":"setStyle","ids":["n.2.1.0"],"style":{"fontSize":16}}]
 *
 * 종료 코드 1 = 계약 위반이나 적용 실패. 원본 파일은 건드리지 않는다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ensureBundle } from './bundle.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const BUNDLE = ensureBundle('apply');

const args = parseArgs(process.argv.slice(2));

if (args.vocab) {
  printVocab();
  process.exit(0);
}

if (!args.file) {
  console.error('장표 파일이 없습니다.\n  node tools/apply.mjs <slide.kgslide> --cmds <commands.json>');
  process.exit(2);
}

const { applyCommands, checkDoc } = await import(new URL(`file://${BUNDLE.replace(/\\/g, '/')}`));

const raw = JSON.parse(await readFile(args.file, 'utf8'));

if (!args.cmds) {
  const check = checkDoc(raw);
  console.log(check.ok ? `읽기 정상 — ${check.title}` : `계약 위반 — ${check.error}`);
  process.exit(check.ok ? 0 : 1);
}

const commands = JSON.parse(args.cmds === '-' ? readFileSync(0, 'utf8') : await readFile(args.cmds, 'utf8'));
if (!Array.isArray(commands)) {
  console.error('커맨드 파일은 배열이어야 합니다.');
  process.exit(2);
}

try {
  const report = applyCommands(raw, commands, new Date().toISOString());
  const c = report.changes;
  console.log(
    `커맨드 ${report.applied}개 적용 — ` +
    `패치 ${sign(c.patches)} · 추가 ${sign(c.added)} · 삭제 ${sign(c.removed)} · 쌓임 ${sign(c.stack)}`,
  );

  if (args.dry) {
    console.log('시험 실행이므로 파일은 그대로 둡니다.');
  } else {
    await writeFile(args.file, `${JSON.stringify(report.doc, null, 2)}\n`, 'utf8');
    console.log(`저장함 — ${args.file}`);
  }
} catch (e) {
  console.error(`적용 실패 — ${e?.message ?? e}`);
  console.error('원본 파일은 그대로입니다.');
  process.exit(1);
}

/* ------------------------------------------------------------------ */

/**
 * 쓸 수 있는 커맨드 목록.
 * 목록을 손으로 적지 않고 core/commands.ts 의 union 에서 읽는다 — 진실은 거기 하나다.
 */
function printVocab() {
  const src = readFileSync(join(ROOT, 'src', 'core', 'commands.ts'), 'utf8');
  const union = /export type Command =([\s\S]*?);\n/.exec(src)?.[1] ?? '';
  console.log('쓸 수 있는 커맨드 (src/core/commands.ts)\n');
  for (const line of union.split('\n')) {
    const t = /type:\s*'([a-zA-Z]+)'/.exec(line);
    if (!t) continue;
    console.log(`  ${t[1].padEnd(14)} ${line.trim().replace(/^\|\s*/, '')}`);
  }
  console.log('\n예)');
  console.log('  [{"type":"setText","id":"n.2.1.0","html":"바꿀 <b>내용</b>"},');
  console.log('   {"type":"setStyle","ids":["n.2.1.0"],"style":{"fontSize":16}}]');
}

function sign(n) {
  return n > 0 ? `+${n}` : String(n);
}

function parseArgs(argv) {
  const out = { file: null, cmds: null, dry: false, vocab: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cmds') out.cmds = argv[++i];
    else if (a === '--dry') out.dry = true;
    else if (a === '--vocab') out.vocab = true;
    else if (!out.file) out.file = resolve(a);
  }
  return out;
}
