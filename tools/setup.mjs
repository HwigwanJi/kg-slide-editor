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
import { createHash } from 'node:crypto';
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

/**
 * 사람이 설치본을 직접 고쳤는가.
 *
 * ~/.claude/skills 는 저장소에서 만들어 내는 파생물이지만, 사람이 거기를 직접 고치는 일이 실제로 생긴다.
 * 그대로 덮으면 그 수정이 소리 없이 사라진다 — 이 도구가 막으려는 바로 그 종류의 사고다.
 *
 * 저장소본과 그냥 대조하면 안 된다. 저장소를 고쳐도 "다르다" 가 되어 갱신할 때마다 걸린다.
 * 그러면 사람은 늘 --force 를 붙이게 되고 장치는 없느니만 못해진다.
 * 그래서 지난번에 무엇을 깔았는지 적어 두고, 설치본이 그때 그대로인지만 본다.
 */
const LEDGER = join(HOME, 'skills', '.kg-install.json');
const norm = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');
const digest = (buf) => createHash('sha256').update(norm(buf)).digest('hex').slice(0, 16);

/** 폴더 안 모든 파일의 지문. 키는 스킬 이름부터 시작하는 상대 경로. */
async function fingerprint(dir, base) {
  const out = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = `${base}/${e.name}`;
    const p = join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, await fingerprint(p, rel));
    else out[rel] = digest(await readFile(p));
  }
  return out;
}

const force = process.argv.includes('--force');
const past = existsSync(LEDGER) ? JSON.parse(await readFile(LEDGER, 'utf8')) : null;
const touched = [];

if (past) {
  for (const name of await readdir(join(ROOT, 'skills'))) {
    const dst = join(HOME, 'skills', name);
    if (!existsSync(dst)) continue;
    const now = await fingerprint(dst, name);
    for (const [rel, sum] of Object.entries(now)) {
      // 깔 때 없던 파일은 사람이 넣은 것이고, 지문이 달라진 것은 사람이 고친 것이다.
      if (past[rel] !== sum) touched.push(rel);
    }
  }
}

if (touched.length > 0 && !force) {
  console.error('✕ 설치본을 누군가 직접 고쳤습니다. 덮어쓰면 그 수정이 사라집니다.\n');
  for (const f of touched.slice(0, 20)) console.error(`    ~/.claude/skills/${f}`);
  if (touched.length > 20) console.error(`    … 외 ${touched.length - 20}건`);
  console.error(`
고칠 곳은 저장소의 skills/ 입니다. ~/.claude/skills 는 거기서 만들어 냅니다.
  · 저 수정을 살리려면  → 저장소 skills/ 로 옮긴 뒤 다시 실행
  · 버려도 되면          → npm run setup -- --force`);
  process.exit(1);
}

const ledger = {};
for (const name of await readdir(join(ROOT, 'skills'))) {
  const dst = join(HOME, 'skills', name);
  // 통째로 갈아 끼운다. 남은 옛 파일이 새 규칙과 섞이면 무엇이 적용됐는지 알 수 없게 된다.
  await rm(dst, { recursive: true, force: true });
  await cp(join(ROOT, 'skills', name), dst, { recursive: true });
  Object.assign(ledger, await fingerprint(dst, name));
  log('•', `스킬 ${name}`);
}
// 다음 설치가 "사람이 고쳤는지" 를 가릴 기준이다.
await writeFile(LEDGER, `${JSON.stringify(ledger, null, 2)}
`, 'utf8');

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

/* ---------- 5. 도구 번들 ---------- */

// 검사·미리보기·적재·적용은 편집기 코어를 번들해 돌린다. 여기서 미리 만들어 두면
// 받은 사람이 첫 명령부터 최신 규칙으로 작업하게 된다. 빌드가 깨졌다면 그 사실도 지금 드러난다.
try {
  const { ensureBundle } = await import('./bundle.mjs');
  ensureBundle('audit');
  ensureBundle('apply');
  log('•', '도구 번들');
} catch (e) {
  console.error(`! 번들을 만들지 못했습니다 — ${e.message}`);
  console.error('  npm install 을 먼저 돌렸는지 확인하세요.');
}

console.log(`
설치를 마쳤습니다. 이어서 할 일

  npx playwright install chromium
  npm run build                              빌드가 통과하는지
  npm run lint:slides -- public/fixtures     검사가 도는지

편집기는 npm run dev 로 띄웁니다.
저장소를 새로 받았을 때(git pull)도 npm install 과 npm run setup 을 다시 돌립니다.`);
