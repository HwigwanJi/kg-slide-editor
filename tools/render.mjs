#!/usr/bin/env node
/**
 * 지금 모습 — 장표를 사람이 고쳐 놓은 그대로 HTML 로 굽는다.
 *
 * 왜 필요한가: `source/*.html` 은 작도한 그대로다. 사람이 편집기에서 글자를 고치거나
 * 크기를 바꾼 것은 `.kgslide` 안에 덧씌움으로 따로 쌓인다.
 * 그래서 원본만 읽고 고치면 남이 바꿔 놓은 것을 못 보고 뭉갠다.
 *
 * AI 가 장표를 고칠 때의 순서는 이렇다.
 *   1. 이 도구로 지금 모습을 읽는다
 *   2. 무엇을 어떻게 바꿀지 정한다
 *   3. `tools/apply.mjs` 로 커맨드를 보낸다 (HTML 을 다시 그리지 않는다)
 *
 * 사용법
 *   node tools/render.mjs <slide.kgslide>              # 표준출력으로
 *   node tools/render.mjs <slide.kgslide> <out.html>   # 파일로
 *   node tools/render.mjs <프로젝트폴더>                # 덱 전체를 한 파일로
 */
import { chromium } from 'playwright';
import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBundle } from './bundle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 프로젝트 파일. 예전 이름도 읽는다. */
const pickDeckFile = (dir) => (existsSync(join(dir, 'project.kgproj')) ? 'project.kgproj' : 'deck.json');
const BUNDLE = ensureBundle('audit');

const [inputArg, outArg] = process.argv.slice(2);
if (!inputArg) {
  console.error('장표나 프로젝트 폴더가 없습니다.\n  node tools/render.mjs <slide.kgslide|프로젝트폴더> [out.html]');
  process.exit(2);
}

const input = resolve(inputArg);
if (!existsSync(input)) {
  console.error(`없는 경로입니다 — ${input}`);
  process.exit(2);
}

/** 폴더면 덱 순서대로 전부, 파일이면 그 하나. */
const files = statSync(input).isDirectory()
  ? JSON.parse(await readFile(join(input, pickDeckFile(input)), 'utf8')).slides
      .map((s) => join(input, 'slides', `${s.id}.kgslide`))
      .filter((f) => existsSync(f))
  : [input];

if (files.length === 0) {
  console.error('구울 장표가 없습니다.');
  process.exit(2);
}

const bundle = await readFile(BUNDLE, 'utf8');
const browser = await chromium.launch();
let out = '';
try {
  const page = await browser.newPage();
  // 굽는 데는 자산이 필요 없다. 빈 문서에 번들만 올린다.
  await page.setContent('<!DOCTYPE html><html><body></body></html>');
  await page.addScriptTag({ content: bundle });

  const parts = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    parts.push(await page.evaluate((d) => window.KGAudit.currentHtml(d), raw));
  }
  out = parts.join('\n');
} finally {
  await browser.close();
}

if (outArg) {
  await writeFile(resolve(outArg), out, 'utf8');
  console.error(`장표 ${files.length}장 -> ${outArg}`);
} else {
  process.stdout.write(out);
}
