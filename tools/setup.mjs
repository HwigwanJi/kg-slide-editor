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
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
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

/* ---------- 0. 준비물 ---------- */

/**
 * --all 이면 준비물까지 여기서 받는다.
 *
 * 받는 사람이 외울 명령을 하나로 줄이려는 것이다. 순서가 있다 — npm install 이 끝나야
 * 번들을 만들 수 있고, playwright 브라우저가 있어야 검사·미리보기가 돈다.
 * 이미 있으면 npm 과 playwright 가 알아서 건너뛰므로 몇 번을 돌려도 결과가 같다.
 */
if (process.argv.includes('--all')) {
  for (const [what, cmd] of [
    ['의존성', 'npm install --no-audit --no-fund'],
    ['미리보기 브라우저', 'npx playwright install chromium'],
  ]) {
    log('•', `${what} 받는 중…`);
    // 윈도우의 npm·npx 는 배치 파일이라 셸을 거쳐야 실행된다. 셸 없이 부르면 EINVAL 로 떨어진다.
    const r = spawnSync(cmd, { cwd: ROOT, stdio: 'inherit', shell: true });
    if (r.status !== 0) {
      console.error(`✕ ${what} 를 받지 못했습니다. 위 출력을 확인하세요.`);
      process.exit(1);
    }
  }
}

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

/**
 * 설치본에 이 저장소의 실제 경로를 채운다.
 *
 * 컴퓨터마다 저장소 위치가 다르므로 문서에 경로를 적어 둘 수 없다. 적어 두면 다른 컴퓨터에서
 * 없는 폴더를 부른다. 그래서 저장소본은 자리표시자만 갖고 실제 경로는 설치할 때 채운다.
 * 지문을 뜨기 전에 채운다 — 나중에 채우면 다음 설치가 이것을 "사람이 고친 것" 으로 본다.
 */
async function stampRoot(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { await stampRoot(p); continue; }
    if (!e.name.endsWith('.md')) continue;
    const text = await readFile(p, 'utf8');
    if (!text.includes('{{EDITOR_ROOT}}')) continue;
    await writeFile(p, text.replaceAll('{{EDITOR_ROOT}}', ROOT), 'utf8');
  }
}

const ledger = {};
for (const name of await readdir(join(ROOT, 'skills'))) {
  const dst = join(HOME, 'skills', name);
  // 통째로 갈아 끼운다. 남은 옛 파일이 새 규칙과 섞이면 무엇이 적용됐는지 알 수 없게 된다.
  await rm(dst, { recursive: true, force: true });
  await cp(join(ROOT, 'skills', name), dst, { recursive: true });
  await stampRoot(dst);
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

/**
 * BOM 을 떼고 읽는다.
 *
 * 윈도우에서 PowerShell 로 settings.json 을 한 번이라도 건드리면 앞에 BOM 이 붙는다.
 * JSON.parse 는 그것을 글자로 보고 죽는다. 설치가 훅 등록 직전에 멈추므로,
 * 스킬은 깔렸는데 워크플로우는 주입되지 않는 어중간한 상태로 남는다.
 * 쓸 때는 다시 붙이지 않는다 — BOM 이 붙은 JSON 은 다른 도구도 똑같이 게운다.
 */
const readJson = async (p) => JSON.parse((await readFile(p, 'utf8')).replace(/^\uFEFF/, ''));

const settings = existsSync(settingsPath) ? await readJson(settingsPath) : {};
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
/*
 * 자리를 비우기 전에 비울 수 있는지 먼저 가린다.
 *
 * 개발 서버가 떠 있으면 윈도우가 public/kg 안의 파일을 잡고 있다. 그대로 rm 하면 절반쯤
 * 지워진 뒤 mkdir 이 EPERM 으로 죽고, 자산이 사라진 채 설치가 끝난다. 편집기는 글꼴도
 * 색도 없는 상태로 남는데, 사람은 설치가 실패한 줄만 알지 무엇이 사라졌는지 모른다.
 *
 * 그래서 지우지 않고 이름부터 바꾼다. 잡혀 있으면 이름 바꾸기가 실패하고, 그때는
 * 아무것도 잃지 않은 상태다. 성공하면 새로 만든 뒤 옛것을 치운다.
 */
const kgOut = join(ROOT, 'public', 'kg');
const kgOld = join(ROOT, 'public', '.kg-old');
if (existsSync(kgOut)) {
  await rm(kgOld, { recursive: true, force: true }).catch(() => undefined);
  try {
    await rename(kgOut, kgOld);
  } catch (e) {
    console.error(`✕ public/kg 를 비울 수 없습니다 — ${e.code ?? e.message}`);
    console.error('  개발 서버(npm run dev)가 떠 있으면 그 안의 파일을 잡고 있습니다.');
    console.error('  서버를 내리고 다시 실행하세요. 아무것도 지우지 않았습니다.');
    process.exit(1);
  }
}
await mkdir(kgOut, { recursive: true });
for (const [from, to] of ASSETS) {
  const src = join(KG, from);
  if (!existsSync(src)) {
    console.error(`✕ 자산이 없습니다 — skills/keynes-group-design/${from}`);
    process.exit(1);
  }
  await cp(src, join(kgOut, to), { recursive: true });
}
// 새 자산이 다 들어간 뒤에 옛것을 치운다. 여기서 실패해도 설치는 이미 성공이다.
await rm(kgOld, { recursive: true, force: true }).catch(() => undefined);
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

/* ---------- 6. 시작 프로젝트 ---------- */

/**
 * 받은 사람이 열자마자 볼 것을 깔아 둔다.
 *
 * 빈 편집기는 무엇을 할 수 있는 도구인지 알려 주지 못한다. samples/ 의 프로젝트를
 * projects/ 로 펼쳐, 열면 바로 실물이 뜨게 한다.
 *
 * **원본은 samples/ 에 그대로 둔다.** projects/ 는 사람이 고치는 작업본이고 git 이 무시한다.
 * 이미 있으면 건드리지 않는다 — 설치를 다시 돌렸다고 남의 편집분을 덮으면 안 된다.
 */
const samples = join(ROOT, 'samples');
if (existsSync(samples)) {
  const work = join(ROOT, 'projects');
  await mkdir(work, { recursive: true });
  const laid = [];
  for (const name of await readdir(samples)) {
    const dst = join(work, name);
    if (existsSync(dst)) continue;
    await cp(join(samples, name), dst, { recursive: true });
    laid.push(name);
  }
  log('•', laid.length ? `시작 프로젝트 ${laid.join(', ')} (projects/)` : '시작 프로젝트 이미 있음 — 그대로 둡니다');
}

const rest = process.argv.includes('--all') ? '' : `
아직 안 받은 것이 있으면 (--all 로 돌리면 여기까지 함께 합니다)

  npm install
  npx playwright install chromium
`;

console.log(`
설치를 마쳤습니다.
${rest}
  npm run dev        편집기를 띄웁니다 (http://localhost:5180)

열면 시작 프로젝트가 이미 들어 있습니다. 그것을 고쳐도 samples/ 의 원본은 그대로입니다.
저장소를 새로 받았을 때(git pull)도 npm run setup 을 다시 돌립니다.`);
