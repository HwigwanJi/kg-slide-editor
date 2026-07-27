#!/usr/bin/env node
/**
 * 장표 미리보기 — 실제 Chromium 으로 찍는다.
 *
 * 왜 재현기(html2canvas 계열)를 쓰지 않는가: KG 장표는 CSS 그라데이션 · clip-path ·
 * mask-image · 웹폰트에 크게 의존한다. 재현기는 셰브론·사다리꼴·도넛을 뭉갠다.
 * 화면에서 본 것과 파일로 나온 것이 달라지면 미리보기가 판단 근거가 되지 못한다. (DECISIONS D3)
 *
 * 사용법
 *   node tools/preview.mjs <입력...> [옵션]
 *
 *   입력  .html  KG 장표 HTML
 *         .kgslide / .json  편집기 문서
 *         폴더   프로젝트 폴더(deck.json 기준으로 전부 찍고 deck 을 갱신)
 *
 *   -o, --out <경로>    출력 파일(입력 하나일 때) 또는 출력 폴더
 *   --scale <배수>      기본 1. 2 로 주면 2560×1810
 *   --quiet             경로만 출력
 */
import { chromium } from 'playwright';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// fileURLToPath 를 쓴다. URL 의 pathname 은 한글과 공백이 퍼센트로 인코딩된 채라
// 손으로 자르면 경로가 어긋난다 — 폴더 이름이 ASCII 일 때만 우연히 맞는다.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 프로젝트 파일. 예전 이름도 읽는다. */
const pickDeckFile = (dir) => (existsSync(join(dir, 'project.kgproj')) ? 'project.kgproj' : 'deck.json');
const KG_DIR = join(ROOT, 'public', 'kg');

// public/kg 는 skills/keynes-group-design 에서 만들어 낸다(npm run setup).
// 없으면 글꼴도 CSS 도 없이 렌더돼 검사·미리보기가 조용히 틀린 값을 낸다. 그래서 먼저 막는다.
if (!existsSync(KG_DIR)) {
  console.error('KG 자산이 없습니다. 먼저 npm run setup 을 돌리세요.');
  process.exit(2);
}
const CANVAS = { w: 1280, h: 905 };

const args = parseArgs(process.argv.slice(2));
if (args.inputs.length === 0) {
  console.error('입력이 없습니다.\n  node tools/preview.mjs <html|kgslide|프로젝트폴더> [-o 출력]');
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: CANVAS.w, height: CANVAS.h },
    deviceScaleFactor: args.scale,
  });

  for (const input of args.inputs) {
    const info = await stat(input).catch(() => null);
    if (!info) {
      console.error(`없는 경로: ${input}`);
      process.exitCode = 1;
      continue;
    }
    if (info.isDirectory()) await shootProject(page, input);
    else await shootFile(page, input, args.out);
  }
} finally {
  await browser.close();
}

/* ------------------------------------------------------------------ */

/** 프로젝트 폴더 전체. deck.json 순서대로 찍고 미리보기 경로를 되써 준다. */
async function shootProject(page, dir) {
  const deckPath = join(dir, pickDeckFile(dir));
  if (!existsSync(deckPath)) {
    // deck.json 이 없으면 그냥 안에 있는 장표 파일을 모두 찍는다.
    const files = (await readdir(dir)).filter((f) => /\.(html|kgslide|json)$/i.test(f));
    for (const f of files) await shootFile(page, join(dir, f), join(dir, 'preview'));
    return;
  }

  const deck = JSON.parse(await readFile(deckPath, 'utf8'));
  const outDir = join(dir, 'preview');
  await mkdir(outDir, { recursive: true });

  for (const entry of deck.slides ?? []) {
    const slidePath = join(dir, 'slides', `${entry.id}.kgslide`);
    if (!existsSync(slidePath)) {
      console.error(`목차에 있으나 파일이 없음: ${entry.id}`);
      continue;
    }
    const out = join(outDir, `${entry.id}.png`);
    const at = (deck.slides ?? []).indexOf(entry) + 1;
    await shoot(page, await htmlOf(slidePath), out, {
      page: at, total: (deck.slides ?? []).length, 'page/total': `${at} / ${(deck.slides ?? []).length}`,
    });
    entry.preview = `preview/${entry.id}.png`;
  }

  await writeFile(deckPath, `${JSON.stringify(deck, null, 2)}\n`, 'utf8');
  say(`deck.json 갱신 — 미리보기 ${deck.slides?.length ?? 0}장`);
}

async function shootFile(page, file, out) {
  const target = decideOut(file, out);
  await mkdir(dirname(target), { recursive: true });
  await shoot(page, await htmlOf(file), target);
}

function decideOut(file, out) {
  const name = `${basename(file, extname(file))}.png`;
  if (!out) return join(dirname(file), name);
  return extname(out).toLowerCase() === '.png' ? out : join(out, name);
}

/**
 * 입력을 브라우저가 열 수 있는 완성 HTML 로 만든다.
 *
 * HTML 이든 편집기 문서든 같은 방식으로 조립한다. 원본 HTML 을 그대로 열면
 * 그 안의 상대 경로(../colors_and_type.css)가 작업 폴더 기준으로 어긋나 스타일이 통째로 빠진다.
 * 그래서 장표 조각과 장표 전용 CSS 만 꺼내 오고, 공통 CSS·자산 경로는 여기서 붙인다.
 */
async function htmlOf(file) {
  const text = await readFile(file, 'utf8');
  const isHtml = extname(file).toLowerCase() === '.html';

  if (isHtml) {
    const slide = /<section[^>]*class="[^"]*kg-slide[^"]*"[\s\S]*?<\/section>/i.exec(text);
    if (!slide) throw new Error(`KG 장표가 아님 — .kg-slide 를 찾지 못함: ${file}`);
    const css = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
    return standalone(slide[0], css);
  }

  const doc = JSON.parse(text);
  if (doc?.source?.kind !== 'kg-html') throw new Error(`KG 장표 문서가 아님: ${file}`);
  return standalone(doc.source.html, doc.source.css ?? '');
}

/**
 * 장표 한 장을 그리기 위한 최소 HTML.
 *
 * 편집분(patches)까지 반영하려면 편집기에서 HTML 로 내보낸 뒤 이 도구로 찍는다.
 * 여기서 패치 적용을 다시 구현하면 화면과 미리보기가 갈라지므로 하지 않는다.
 */
function standalone(slideHtml, slideCss) {
  // 경로는 전부 KG 폴더 기준 상대경로다. 아래 shoot() 이 그 폴더 안에 임시 파일을 만들어 연다.
  // 작도 원본은 ../assets/, 적재본은 /kg/assets/ 로 들고 있다. 둘 다 되돌려야 그림이 뜬다.
  const html = slideHtml.replace(/(?:(?:\.\.\/)+|\/kg\/)assets\//g, 'assets/');
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="colors_and_type.css">
<link rel="stylesheet" href="kg-slide.css">
<style>html,body{margin:0;background:#fff;}
.kg-detached-layer{position:absolute;inset:0;pointer-events:none;}
.kg-detached-layer>*{pointer-events:auto;}
${slideCss}</style></head><body>${html}</body></html>`;
}

/**
 * KG CSS 폴더 안에 임시 파일을 만들어 연다.
 *
 * setContent 로 넣으면 문서 출처가 about:blank 이 되고, 크로미움은 그 상태에서
 * file:// 하위 리소스를 막는다. 스타일이 통째로 빠진 채 찍히므로 반드시 파일로 연다.
 */
async function shoot(page, html, out, auto = {}) {
  const tmp = join(KG_DIR, `.preview-${process.pid}.tmp.html`);
  await writeFile(tmp, html, 'utf8');
  try {
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    // 쪽번호처럼 장표 혼자서는 알 수 없는 값을 덱 순서에서 채운다.
    await page.evaluate((fields) => {
      for (const [field, value] of Object.entries(fields)) {
        for (const el of document.querySelectorAll(`[data-kg-auto="${field}"]`)) {
          el.textContent = String(value);
        }
      }
    }, auto);
    await screenshot(page, out);
  } finally {
    await rm(tmp, { force: true });
  }
}

async function screenshot(page, out) {
  // 웹폰트가 준비되기 전에 찍으면 대체 글꼴로 나온다. 이것만은 반드시 기다린다.
  await page.evaluate(() => document.fonts.ready);

  const slide = page.locator('.kg-slide').first();
  if (await slide.count() === 0) throw new Error('.kg-slide 요소를 찾지 못했습니다');
  await slide.screenshot({ path: out });
  say(out);
}

function say(message) {
  if (!args.quiet) console.log(message);
  else if (message.endsWith('.png')) console.log(message);
}

function parseArgs(argv) {
  const out = { inputs: [], out: null, scale: 1, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') out.out = argv[++i];
    else if (a === '--scale') out.scale = Number(argv[++i]) || 1;
    else if (a === '--quiet') out.quiet = true;
    else out.inputs.push(resolve(a));
  }
  return out;
}
