#!/usr/bin/env node
/**
 * 설치 — 이 저장소 하나로 새 컴퓨터를 작업 가능한 상태로 만든다.
 *
 *   node tools/setup.mjs
 *
 * 여러 대에서 나눠 작도하려면 모든 컴퓨터가 같은 스킬·같은 CSS·같은 규칙을 써야 한다.
 * 한 대라도 다르면 나중에 합칠 때 글꼴과 간격이 어긋나 장표가 따로 논다.
 * 그래서 진실은 이 저장소의 skills/ 한 곳이고, 나머지는 전부 여기서 복사해 만든다.
 *
 *   skills/            ->  ~/.claude/skills/        클로드가 읽는 자리
 *   hooks/             ->  ~/.claude/hooks/         워크플로우 주입 훅
 *   skills/keynes-...  ->  public/kg/               편집기가 장표를 그릴 때 쓰는 자산
 *
 * 몇 번을 돌려도 결과가 같다. 이미 있는 설정은 덮어쓰지 않고 필요한 항목만 더한다.
 */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = join(homedir(), '.claude');
const KG = join(ROOT, 'skills', 'keynes-group-design');

/** 편집기가 장표를 그릴 때 필요한 자산. 왼쪽이 스킬 안 경로, 오른쪽이 public/kg 안 이름. */
const ASSETS = [
  ['colors_and_type.css', 'colors_and_type.css'],
  ['kg-slide.css', 'kg-slide.css'],
  ['slides/kg-standalone.css', 'kg-standalone.css'],
  ['fonts', 'fonts'],
  ['assets', 'assets'],
];

/** 훅 등록. 이 두 자리에 같은 명령이 붙어야 컨텍스트가 압축돼도 워크플로우가 살아남는다. */
const HOOK_CMD = process.platform === 'win32'
  ? 'node "%USERPROFILE%\\.claude\\hooks\\kg-workflow.mjs"'
  : 'node "$HOME/.claude/hooks/kg-workflow.mjs"';
const HOOK_SLOTS = [
  ['SessionStart', 'startup|resume|clear|compact'],
  ['UserPromptSubmit', ''],
];

const log = (mark, msg) => console.log(`${mark} ${msg}`);

/* ---------- 1. 스킬 ---------- */

await mkdir(join(HOME, 'skills'), { recursive: true });
for (const name of await readdir(join(ROOT, 'skills'))) {
  const dst = join(HOME, 'skills', name);
  // 통째로 갈아 끼운다. 남은 옛 파일이 새 규칙과 섞이면 무엇이 적용됐는지 알 수 없게 된다.
  await rm(dst, { recursive: true, force: true });
  await cp(join(ROOT, 'skills', name), dst, { recursive: true });
  log('•', `스킬 ${name}`);
}

/* ---------- 2. 훅 ---------- */

await mkdir(join(HOME, 'hooks'), { recursive: true });
await cp(join(ROOT, 'hooks'), join(HOME, 'hooks'), { recursive: true });
log('•', '훅 kg-workflow.mjs');

/* ---------- 3. 훅 등록 ---------- */

const settingsPath = join(HOME, 'settings.json');
const settings = existsSync(settingsPath)
  ? JSON.parse(await readFile(settingsPath, 'utf8'))
  : {};
settings.hooks ??= {};

let added = 0;
for (const [event, matcher] of HOOK_SLOTS) {
  settings.hooks[event] ??= [];
  const already = settings.hooks[event]
    .some((g) => (g.hooks ?? []).some((h) => (h.command ?? '').includes('kg-workflow.mjs')));
  if (already) continue;
  settings.hooks[event].push({ matcher, hooks: [{ type: 'command', command: HOOK_CMD, timeout: 15 }] });
  added++;
}
if (added) await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
log('•', added ? `settings.json 에 훅 ${added}건 등록` : 'settings.json 훅 이미 등록됨');

// 남의 컴퓨터에서 만든 설정이 그대로 따라오면 없는 경로를 부른다. 지우지는 않고 알리기만 한다.
for (const [event, groups] of Object.entries(settings.hooks)) {
  for (const g of groups) {
    for (const h of g.hooks ?? []) {
      const m = /-File\s+(\S+)/.exec(h.command ?? '');
      if (m && !existsSync(m[1].replace(/"/g, ''))) {
        log('!', `${event} 훅이 없는 경로를 부릅니다 — ${m[1]}`);
      }
    }
  }
}

/* ---------- 4. 편집기 자산 ---------- */

if (!existsSync(KG)) {
  console.error('✕ skills/keynes-group-design 이 없습니다. 저장소를 통째로 받았는지 확인하세요.');
  process.exit(1);
}
const kgOut = join(ROOT, 'public', 'kg');
await rm(kgOut, { recursive: true, force: true });
await mkdir(kgOut, { recursive: true });
for (const [from, to] of ASSETS) {
  const src = join(KG, from);
  if (!existsSync(src)) {
    console.error(`✕ 자산이 없습니다 — skills/keynes-group-design/${from}`);
    process.exit(1);
  }
  await cp(src, join(kgOut, to), { recursive: true });
}
log('•', `편집기 자산 ${ASSETS.length}건 (public/kg)`);

console.log(`
설치를 마쳤습니다. 이어서 할 일

  npm install
  npx playwright install chromium
  npm run build            빌드가 통과하는지
  npm run lint:slides -- public/fixtures    검사가 도는지

편집기는 npm run dev 로 띄웁니다.`);
