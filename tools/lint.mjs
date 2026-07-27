#!/usr/bin/env node
/**
 * 장표 검사 — 인프라 하네스.
 *
 * 사람이 눈으로 놓치는 것을 기계가 매번 같은 기준으로 잡는다.
 *   위계 미지정 · 프로젝트 최소 글자 크기 미달 · 박스 넘침 · 장표 밖 이탈 · 빈 박스
 *
 * 검사 규칙은 편집기 코어를 그대로 번들해 브라우저에 넣어 돌린다(tools/gen/audit.iife.js).
 * 규칙을 이 파일에 다시 쓰면 화면과 검사가 곧 갈라진다.
 *
 * 사용법
 *   node tools/lint.mjs <html|kgslide|프로젝트폴더>... [--json] [--quiet]
 *   종료 코드 1 = 지적 사항 있음. 자동화에서 그대로 쓸 수 있다.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const KG_DIR = join(ROOT, 'public', 'kg');
const BUNDLE = join(ROOT, 'tools', 'gen', 'audit.iife.js');
const SETTINGS_FILE = 'kg.config.json';

const KIND_LABEL = {
  clipped: '박스 안에서 잘림',
  outside: '장표 밖으로 벗어남',
  sparse: '박스가 헐거움',
  tooSmall: '글자가 하한보다 작음',
};

const args = parseArgs(process.argv.slice(2));
if (args.inputs.length === 0) {
  console.error('입력이 없습니다.\n  node tools/lint.mjs <html|kgslide|프로젝트폴더>... [--json]');
  process.exit(2);
}

ensureBundle();
const bundle = await readFile(BUNDLE, 'utf8');

const browser = await chromium.launch();
const reports = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 905 } });
  for (const input of args.inputs) {
    const info = await stat(input).catch(() => null);
    if (!info) {
      console.error(`없는 경로: ${input}`);
      process.exitCode = 2;
      continue;
    }
    if (info.isDirectory()) reports.push(...await lintProject(page, input));
    else reports.push(await lintFile(page, input, await settingsNear(input)));
  }
} finally {
  await browser.close();
}

report(reports);

/* ------------------------------------------------------------------ */

function ensureBundle() {
  if (existsSync(BUNDLE)) return;
  console.error('검사 번들이 없어 먼저 만듭니다 (npm run build:audit)');
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:audit'], {
    cwd: ROOT, stdio: 'inherit',
  });
}

/** 입력 옆이나 프로젝트 폴더의 설정을 찾는다. 없으면 빈 객체 → 코어가 기본값을 쓴다. */
async function settingsNear(file) {
  for (const dir of [dirname(file), dirname(dirname(file))]) {
    const path = join(dir, SETTINGS_FILE);
    if (existsSync(path)) {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch {
        console.error(`${path} 를 읽지 못해 기본값을 씁니다`);
      }
    }
  }
  return {};
}

async function lintProject(page, dir) {
  const settings = existsSync(join(dir, SETTINGS_FILE))
    ? JSON.parse(await readFile(join(dir, SETTINGS_FILE), 'utf8'))
    : {};
  const out = [];

  const deckPath = join(dir, 'deck.json');
  if (existsSync(deckPath)) {
    const deck = JSON.parse(await readFile(deckPath, 'utf8'));
    for (const entry of deck.slides ?? []) {
      const file = join(dir, 'slides', `${entry.id}.kgslide`);
      if (existsSync(file)) out.push(await lintFile(page, file, settings, entry.title));
    }
    return out;
  }

  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, dirent.name);
    if (dirent.isDirectory() && /^(source|slides)$/.test(dirent.name)) {
      for (const f of await readdir(path)) {
        if (/\.(html|kgslide)$/i.test(f)) out.push(await lintFile(page, join(path, f), settings));
      }
    } else if (dirent.isFile() && /\.(html|kgslide)$/i.test(dirent.name)) {
      out.push(await lintFile(page, path, settings));
    }
  }
  return out;
}

async function lintFile(page, file, settings, title) {
  const html = await assemble(file);
  const tmp = join(KG_DIR, `.lint-${process.pid}.tmp.html`);
  await writeFile(tmp, html, 'utf8');
  try {
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ content: bundle });
    const result = await page.evaluate((s) => window.KGAudit.auditPage(s), settings);
    return { file, title: title ?? basename(file), ...result };
  } catch (e) {
    return { file, title: title ?? basename(file), error: String(e?.message ?? e), issues: [], missingRole: [] };
  } finally {
    await rm(tmp, { force: true });
  }
}

/** 미리보기 도구와 같은 방식으로 조립한다. 두 도구가 다른 화면을 보면 안 된다. */
async function assemble(file) {
  const text = await readFile(file, 'utf8');
  let slideHtml;
  let slideCss;

  if (extname(file).toLowerCase() === '.html') {
    const found = /<section[^>]*class="[^"]*kg-slide[^"]*"[\s\S]*?<\/section>/i.exec(text);
    if (!found) throw new Error(`KG 장표가 아님: ${file}`);
    slideHtml = found[0];
    slideCss = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  } else {
    const doc = JSON.parse(text);
    slideHtml = doc.source.html;
    slideCss = doc.source.css ?? '';
  }

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="colors_and_type.css">
<link rel="stylesheet" href="kg-slide.css">
<style>html,body{margin:0;background:#fff;}
.kg-detached-layer{position:absolute;inset:0;pointer-events:none;}
${slideCss}</style></head><body>${slideHtml.replace(/(?:\.\.\/)*assets\//g, 'assets/')}</body></html>`;
}

/* ------------------------------------------------------------------ */

function report(reports) {
  if (args.json) {
    console.log(JSON.stringify(reports, null, 2));
    process.exitCode = totalProblems(reports) > 0 ? 1 : process.exitCode ?? 0;
    return;
  }

  let total = 0;
  for (const r of reports) {
    const problems = (r.error ? 1 : 0) + (r.issues?.length ?? 0)
      + (r.missingRole?.length ?? 0) + (r.wording?.length ?? 0);
    total += problems;

    if (r.error) {
      console.log(`✕ ${r.title} — ${r.error}`);
      continue;
    }
    if (problems === 0) {
      if (!args.quiet) console.log(`○ ${r.title} — 이상 없음 (요소 ${r.nodes}, 글자 ${r.textRuns})`);
      continue;
    }

    console.log(`● ${r.title} — 지적 ${problems}건 (요소 ${r.nodes}, 글자 ${r.textRuns})`);
    if (r.missingRole?.length) {
      console.log(`   위계 미지정 ${r.missingRole.length}건 — ${r.missingRole.slice(0, 5).join(', ')}`);
    }
    for (const [rule, list] of groupBy(r.wording ?? [], (i) => i.rule)) {
      console.log(`   문구 · ${rule} ${list.length}건 — ${list[0].detail}`);
      for (const i of list.slice(0, 4)) {
        console.log(`     · "${i.hit}"  ←  ${i.preview}`);
      }
      if (list.length > 4) console.log(`     · 그 외 ${list.length - 4}건`);
    }
    for (const [kind, list] of groupBy(r.issues ?? [], (i) => i.kind)) {
      console.log(`   ${KIND_LABEL[kind] ?? kind} ${list.length}건`);
      for (const i of list.slice(0, 4)) {
        console.log(`     · ${i.preview || i.id} — ${i.detail}`);
      }
      if (list.length > 4) console.log(`     · 그 외 ${list.length - 4}건`);
    }
  }

  console.log(total === 0 ? '\n검사 통과' : `\n지적 합계 ${total}건`);
  if (total > 0) process.exitCode = 1;
}

function totalProblems(reports) {
  return reports.reduce((n, r) => n + (r.error ? 1 : 0) + (r.issues?.length ?? 0)
    + (r.missingRole?.length ?? 0) + (r.wording?.length ?? 0), 0);
}

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function parseArgs(argv) {
  const out = { inputs: [], json: false, quiet: false };
  for (const a of argv) {
    if (a === '--json') out.json = true;
    else if (a === '--quiet') out.quiet = true;
    else out.inputs.push(resolve(a));
  }
  return out;
}
