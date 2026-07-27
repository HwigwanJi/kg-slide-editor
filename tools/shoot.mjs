#!/usr/bin/env node
/**
 * 편집기 화면 그대로 찍어 PPTX·PNG 로 만든다.
 *
 * 왜 이 통로가 따로 있는가 — **편집기에 떠 있는 것이 진실이기 때문이다.**
 * 원래 내보내기는 문서를 다시 구워(currentHtml) 찍는다. 그 경로에 화면과 어긋나는 자리가
 * 있으면 "화면은 멀쩡한데 파일만 깨진" 결과가 나오고, 어느 쪽을 보고 고쳐야 할지 알 수 없다.
 * 여기서는 굽지 않는다. 편집기가 이미 그려 놓은 캔버스를 그대로 찍는다.
 *
 * 사용법
 *   node tools/shoot.mjs <프로젝트폴더> [--pptx] [--png] [--pdf] [-o 출력폴더] [--url http://localhost:5180]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const CANVAS = { width: 1280, height: 905 };
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('-'));
if (!dir) {
  console.error('프로젝트 폴더가 없습니다.\n  node tools/shoot.mjs <프로젝트폴더> [--pptx] [--png] [--pdf]');
  process.exit(2);
}
const flag = (n) => args.includes(n);
const at = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const project = resolve(dir);
const URL_ = at('--url') ?? 'http://localhost:5180';
const out = resolve(at('-o') ?? join(project, 'export-화면'));
const wantPng = flag('--png');
const wantPptx = flag('--pptx') || (!wantPng && !flag('--pdf'));
const wantPdf = flag('--pdf');

const safeName = (s) => (s || '제목 없음').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const deckFile = existsSync(join(project, 'project.kgproj')) ? 'project.kgproj' : 'deck.json';
const deck = JSON.parse((await readFile(join(project, deckFile), 'utf8')).replace(/^﻿/, ''));
const total = deck.slides.length;

await mkdir(out, { recursive: true });
const pngDir = join(out, 'png');
if (wantPng) await mkdir(pngDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1700, height: 1150 },
  deviceScaleFactor: 2,
});

/*
 * 편집기는 지난번에 연 폴더를 기억한다. 그 자리에 우리가 찍을 폴더를 미리 넣어 두면
 * 창이 뜨면서 알아서 그 프로젝트를 잇는다 — 폴더 고르기 창을 손으로 넘길 필요가 없다.
 */
await page.addInitScript((p) => {
  localStorage.setItem('kg-slide-editor/last-folder', p);
}, project);

await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);

/*
 * 폴더 고르기 창이 뜨면 손으로 넘긴다.
 *
 * 지난번 폴더를 기억시켜 두어도 창이 뜨는 경우가 있다. 그대로 두고 찍으면 창이 장표 위에
 * 덮인 채로 파일에 들어간다 — 실제로 53장을 그렇게 찍어 버렸다. 그래서 창이 있으면
 * 목표 폴더까지 눌러 들어간 뒤에야 찍기 시작한다.
 */
if (await page.$('.ed-picker')) {
  const parts = project.replace(/\\/g, '/').split('/').filter(Boolean);
  const root = `${parts[0]}\\`;                       // "D:\"
  await page.click(`.ed-picker__chip:text-is("${root}")`).catch(() => {});
  await page.waitForTimeout(400);
  for (const name of parts.slice(1)) {
    await page.click(`.ed-picker__row:has-text("${name}")`, { timeout: 15_000 });
    await page.waitForTimeout(400);
  }
  await page.click('.ed-picker__btn[data-primary="true"]');
}

// 덱이 올라올 때까지 기다린다. 다리(dev 서버)를 통해 읽으므로 몇 초 걸릴 수 있다.
await page.waitForFunction(
  () => !document.querySelector('.ed-picker') && document.querySelectorAll('.ed-slide').length > 0,
  null, { timeout: 90_000 },
);

/*
 * 찍을 목록은 **편집기 목록**에서 가져온다. 파일(project.kgproj)에서 가져오지 않는다.
 *
 * 둘이 다를 수 있다 — 계약상 존재는 slides/ 폴더가 정하고 순서만 project 파일이 정하므로,
 * 목록에 없는 파일이 있으면 편집기 목록이 더 길다(실제로 파일 53 · 화면 54였다).
 * 화면에 뜬 것이 진실이니 화면을 따른다.
 */
const rail = await page.evaluate(() => [...document.querySelectorAll('.ed-slide')]
  .map((b) => b.querySelector('.ed-slide__title')?.textContent?.trim() ?? ''));
if (rail.length !== total) {
  console.error(`알림 — 목록 ${rail.length}장 · project 파일 ${total}장. 화면 목록을 따릅니다.`);
}

/*
 * 찍기용 차림새를 CSS 로 못박는다.
 *
 * 자바스크립트로 배율을 1 로 돌려놓아도 편집기가 창 크기를 다시 재서 덮어쓴다
 * (목록을 숨기는 순간 크기가 바뀌므로 반드시 덮인다 — 실제로 1184px 로 찍혔다).
 * 규칙으로 걸어 두면 다시 그려도 살아 있다.
 */
await page.addStyleTag({ content: `
  .ed-rail, .ed-panel, .ed-toolbar, .ed-status,
  .ed-overlay, .ed-marquee-layer, .ed-hint, .ed-canvas__hint { display: none !important; }
  .ed-canvas { padding: 0 !important; overflow: visible !important; }
  .ed-stage { width: ${CANVAS.width}px !important; height: ${CANVAS.height}px !important; }
  .ed-paper { transform: none !important; box-shadow: none !important; }
` });
await page.evaluate(() => document.querySelector('.ed-paper')?.setAttribute('data-hint', 'off'));
await page.waitForTimeout(200);

const shots = [];
try {
  for (const [i, railTitle] of rail.entries()) {
    // 이 장표를 연다.
    await page.evaluate((k) => {
      document.querySelectorAll('.ed-slide')[k]?.click();
    }, i);

    /*
     * 편집기가 "이 장표를 열었다" 고 표시할 때까지 기다린다.
     *
     * 목록 제목과 장표 머리말은 원래 다른 글이다(목록은 문서 제목, 화면은 머리말 글자).
     * 그래서 글자를 맞대 보는 것으로는 확인이 안 된다. 대신 편집기가 스스로 켜 두는
     * aria-current 를 본다 — 어느 것이 열려 있는지는 편집기가 가장 정확히 안다.
     *
     * 이 확인이 없어서 53장을 통째로 잘못 찍은 적이 있다. 폴더 고르기 창이 덮여 있는데
     * 목록을 눌러도 화면은 안 바뀌었고, 그대로 찍혀 PPTX 까지 나왔다.
     * 틀린 파일을 조용히 내주느니 여기서 멈춘다.
     */
    await page.waitForFunction((k) => {
      if (document.querySelector('.ed-blocker, .ed-picker')) return false;
      if (!document.querySelector('.ed-paper .kg-slide')) return false;
      const items = [...document.querySelectorAll('.ed-slide')];
      return items[k]?.getAttribute('aria-current') === 'true';
    }, i, { timeout: 30_000 });
    await page.waitForTimeout(240);

    /*
     * 배율을 1 로 못박는다.
     * 편집기는 창에 맞춰 줄여 그리는데, 그대로 찍으면 작은 그림이 나온다.
     * 배치는 transform 이라 배율을 바꿔도 흐름은 그대로다(.ed-paper 는 늘 1280px).
     */
    await page.evaluate(() => {
      document.querySelector('.ed-paper')?.setAttribute('data-hint', 'off');
      document.querySelector('.ed-canvas')?.scrollTo(0, 0);
    });
    await page.waitForTimeout(120);

    // 종이가 실제로 놓인 자리를 재서 딱 그만큼만 잘라낸다.
    const box = await page.evaluate(() => {
      const r = document.querySelector('.ed-paper').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    if (Math.round(box.width) !== CANVAS.width) {
      throw new Error(`${i + 1}번째 — 종이 폭이 ${Math.round(box.width)}px 입니다(1280 이어야 함)`);
    }
    const buf = await page.screenshot({ clip: box });
    shots.push({ at: i + 1, title: railTitle, buf });

    if (wantPng) {
      await writeFile(join(pngDir, `${String(i + 1).padStart(2, "0")}_${safeName(railTitle)}.png`), buf);
    }
    process.stderr.write(`\r찍는 중 ${i + 1}/${total}   `);
  }
} finally {
  await browser.close();
}
process.stderr.write('\r');

const made = [];
if (wantPng) made.push(`${pngDir} (${shots.length}장)`);

if (wantPptx) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const deckOut = new PptxGenJS();
  const inch = (px) => px / 96;
  deckOut.defineLayout({ name: 'KG', width: inch(CANVAS.width), height: inch(CANVAS.height) });
  deckOut.layout = 'KG';
  for (const s of shots) {
    deckOut.addSlide().addImage({
      data: `image/png;base64,${s.buf.toString('base64')}`,
      x: 0, y: 0, w: inch(CANVAS.width), h: inch(CANVAS.height),
    });
  }
  const file = join(out, `${safeName(deck.name || basename(project))}.pptx`);
  await deckOut.writeFile({ fileName: file });
  made.push(`${file} (${shots.length}장)`);
}

if (wantPdf) {
  // 그림 한 장이 한 쪽. 화면을 그대로 옮기는 것이 목적이라 벡터로 만들지 않는다.
  const b2 = await chromium.launch();
  const p2 = await b2.newPage({ viewport: CANVAS });
  const body = shots.map((s) => `<img src="data:image/png;base64,${s.buf.toString('base64')}">`).join('');
  await p2.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0}img{display:block;width:${CANVAS.width}px;height:${CANVAS.height}px;break-after:page}
img:last-child{break-after:auto}</style></head><body>${body}</body></html>`, { waitUntil: 'load' });
  const file = join(out, `${safeName(deck.name || basename(project))}.pdf`);
  await p2.pdf({
    path: file, width: `${CANVAS.width}px`, height: `${CANVAS.height}px`, printBackground: true,
  });
  await b2.close();
  made.push(`${file} (${shots.length}쪽)`);
}

console.log('편집기 화면 그대로 찍었습니다.');
for (const m of made) console.log('  ' + m);
