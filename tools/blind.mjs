#!/usr/bin/env node
/**
 * 블라인드 — 가릴 만한 것을 찾아 늘어놓고, 지금 무엇이 칠해져 있는지 보여 준다.
 *
 * **자동으로 칠하지 않는다.** 무엇을 가릴지는 사업 판단이다. 외부 자문위원 이름은
 * 어떤 자리에서는 실적의 근거고 어떤 자리에서는 개인정보다. 기계가 정할 일이 아니다.
 *
 * AI 가 쓰는 순서
 *   1. node tools/blind.mjs <프로젝트폴더>            후보를 훑는다
 *   2. 사람에게 보여 주고 무엇을 가릴지 정한다
 *   3. node tools/apply.mjs <slide.kgslide> --cmds -  setBlind 커맨드로 얹는다
 *
 * 3에서 문서를 다시 쓰지 않고 커맨드만 보내는 것이 중요하다. 사람이 편집기에서 칠해 둔
 * 자국을 덮지 않고 **더하기만** 한다(docs/CONCURRENCY.md 필드 소유권).
 *
 * 사용법
 *   node tools/blind.mjs <프로젝트폴더|slide.kgslide> [--json] [--칠해진것만]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureBundle } from './bundle.mjs';
import { linkAssets, projectRootOf } from './assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KG_DIR = join(ROOT, 'public', 'kg');
const pickDeckFile = (dir) => (existsSync(join(dir, 'project.kgproj')) ? 'project.kgproj' : 'deck.json');

if (!existsSync(KG_DIR)) {
  console.error('KG 자산이 없습니다. 먼저 npm run setup 을 돌리세요.');
  process.exit(2);
}

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('-'));
const asJson = args.includes('--json');
const onlyMarked = args.includes('--칠해진것만') || args.includes('--marked');

if (!input) {
  console.error('입력이 없습니다.\n  node tools/blind.mjs <프로젝트폴더|slide.kgslide> [--json]');
  process.exit(2);
}

const KIND_LABEL = {
  column: '민감 열',
  person: '사람 이름',
  contact: '연락처',
  idnum: '식별번호',
  identity: '사명',
};

const target = resolve(input);
if (!existsSync(target)) {
  console.error(`없는 경로입니다 — ${target}`);
  process.exit(2);
}

/** 덱 순서대로. 파일 하나를 주면 그 하나만. */
const info = await stat(target);
let slides;
if (info.isDirectory()) {
  const deck = JSON.parse((await readFile(join(target, pickDeckFile(target)), 'utf8')).replace(/^﻿/, ''));
  slides = (deck.slides ?? [])
    .map((e, i) => ({ at: i + 1, title: e.title ?? e.id, file: join(target, 'slides', `${e.id}.kgslide`) }))
    .filter((s) => existsSync(s.file));
} else {
  slides = [{ at: 1, title: basename(target), file: target }];
}

const bundle = await readFile(ensureBundle('audit'), 'utf8');
const browser = await chromium.launch();
const report = [];

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 905 } });
  for (const s of slides) {
    const raw = JSON.parse((await readFile(s.file, 'utf8')).replace(/^﻿/, ''));

    /*
     * 장표 CSS 를 얹고 연다.
     *
     * 후보 판정은 글자만 보지만, 그리는 과정에서 위계 추론이 **계산된 서식** 을 읽는다.
     * CSS 없이 그리면 그 판정이 달라져 글자 덩어리가 다르게 나뉘고, 결국 후보의
     * 노드 id 가 편집기에서 보는 것과 어긋난다 — 칠했는데 엉뚱한 데가 가려진다.
     */
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <link rel="stylesheet" href="colors_and_type.css">
      <link rel="stylesheet" href="kg-slide.css">
      <style>${raw.source?.css ?? ''}</style></head><body></body></html>`;
    const tmp = join(KG_DIR, `.blind-${process.pid}.tmp.html`);
    await writeFile(tmp, html, 'utf8');
    try {
      await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: bundle });
    } finally {
      await rm(tmp, { force: true });
    }

    const [candidates, marked] = await page.evaluate((d) => [
      window.KGAudit.blindScan(d),
      Object.entries(d.blind?.marks ?? {}).map(([id, m]) => ({ id, ...m })),
    ], raw);

    report.push({ at: s.at, title: s.title, file: s.file, candidates, marked });
  }
} finally {
  await browser.close();
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

let candTotal = 0;
let markTotal = 0;
for (const r of report) {
  // 이미 칠해진 후보는 다시 물어볼 것이 없다. 목록에서 뺀다.
  const fresh = r.candidates.filter((c) => !c.already);
  markTotal += r.marked.length;
  if (onlyMarked) {
    if (r.marked.length === 0) continue;
    console.log(`\n${String(r.at).padStart(2)}p ${r.title} — 가림 ${r.marked.length}곳`);
    for (const m of r.marked) console.log(`   · ${m.id}  ${m.by === 'ai' ? '[AI]' : '[사람]'} ${m.reason}`);
    continue;
  }
  if (fresh.length === 0 && r.marked.length === 0) continue;
  candTotal += fresh.length;

  console.log(`\n${String(r.at).padStart(2)}p ${r.title}`);
  if (r.marked.length) console.log(`   이미 가림 ${r.marked.length}곳`);

  /*
   * 열은 묶어서 보여 준다.
   *
   * 판단은 칸이 아니라 열 단위로 내린다 — "성명 열을 가릴까요" 는 답할 수 있지만
   * 열여섯 개의 이름을 하나씩 물으면 답할 수가 없다. id 는 다 싣는다. 그대로
   * setBlind 에 넣어야 하기 때문이다.
   */
  const cols = new Map();
  for (const c of fresh) {
    if (c.kind !== 'column') continue;
    const list = cols.get(c.hit) ?? [];
    list.push(c);
    cols.set(c.hit, list);
  }
  for (const [hit, list] of cols) {
    const sample = list.slice(0, 3).map((c) => c.preview).join(' · ');
    console.log(`   ? ${hit} — ${list.length}칸   ${sample}${list.length > 3 ? ' …' : ''}`);
    console.log(`       ${list.map((c) => c.id).join(' ')}`);
  }
  for (const c of fresh) {
    if (c.kind === 'column') continue;
    console.log(`   ? ${KIND_LABEL[c.kind] ?? c.kind} — ${c.hit}`);
    console.log(`       ${c.id}  "${c.preview}"`);
  }
}

console.log(`\n후보 ${candTotal}건 · 이미 가림 ${markTotal}곳`);
if (candTotal > 0 && !onlyMarked) {
  console.log('가릴 것을 정한 뒤 apply.mjs 로 얹습니다:');
  console.log('  [{"type":"setBlind","ids":["n.2.1.0"],"on":true,"by":"ai","reason":"참여인력 실명"}]');
}
