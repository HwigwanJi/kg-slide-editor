#!/usr/bin/env node
/**
 * 적재 — KG 장표 HTML 을 프로젝트에 넣는다 (워크플로우 3단계).
 *
 * 임포트 규칙(자산 경로 치환·상단 위계 잠금·제목 추출)을 여기 다시 쓰지 않는다.
 * 편집기 어댑터를 그대로 번들해 브라우저에서 돌린다. 사람이 "적재"로 넣은 것과 같은 결과가 나온다.
 *
 * 사용법
 *   node tools/ingest.mjs <프로젝트폴더> <장표.html>...
 *   node tools/ingest.mjs <프로젝트폴더>            # source/ 안의 html 전부
 *
 * 하는 일: slides/<id>.kgslide 를 쓰고 프로젝트 파일(project.kgproj) 목차에 순서대로 등록한다.
 * 이미 같은 origin 으로 넣은 장표가 있으면 id·순서·미리보기 경로를 그대로 물려받는다.
 *
 * 원본만 갈아끼운다. 사람이 쌓아 둔 편집분(patches·묘비·테마)은 그대로 이어 붙인다.
 * 원본이 바뀌어 같은 자리를 가리키지 못하게 된 것은 옮기지 않고 몇 건인지 알린다.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ensureBundle } from './bundle.mjs';

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
const BUNDLE = ensureBundle('audit');

const [projectArg, ...fileArgs] = process.argv.slice(2);
if (!projectArg) {
  console.error('프로젝트 폴더가 없습니다.\n  node tools/ingest.mjs <프로젝트폴더> [장표.html...]');
  process.exit(2);
}

const project = resolve(projectArg);
const files = fileArgs.length
  ? fileArgs.map((f) => resolve(f))
  // 파일 이름이 곧 순서다. readdir 순서는 운영체제가 정하므로 그대로 두면
  // 컴퓨터마다 덱 순서가 달라진다 — 여러 대에서 나눠 그린 것을 모을 때 반드시 어긋난다.
  : (await readdir(join(project, 'source')).catch(() => []))
      .filter((f) => /\.html?$/i.test(f))
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((f) => join(project, 'source', f));

if (files.length === 0) {
  console.error(`넣을 장표가 없습니다. ${join(project, 'source')} 를 확인하세요.`);
  process.exit(2);
}

const bundle = await readFile(BUNDLE, 'utf8');
const deckPath = join(project, pickDeckFile(project));
const deck = existsSync(deckPath)
  ? JSON.parse(await readFile(deckPath, 'utf8'))
  : {
      v: 1, id: crypto.randomUUID(), name: basename(project), slides: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

await mkdir(join(project, 'slides'), { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 905 } });
  const tmp = join(KG_DIR, `.ingest-${process.pid}.tmp.html`);

  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const origin = basename(file);

    // 기존 항목이 있으면 id 를 유지한다. 덱의 자리와 미리보기 파일 이름이 이어진다.
    const existing = deck.slides.find((s) => s.origin === origin);
    const id = existing?.id ?? crypto.randomUUID();

    // 사람이 쌓아 둔 편집분. 원본만 갈아끼우고 이것은 그대로 들고 간다(docs/CONCURRENCY.md).
    const slideFile = join(project, 'slides', `${id}.kgslide`);
    const prev = existsSync(slideFile)
      ? JSON.parse(await readFile(slideFile, 'utf8'))
      : null;

    // 자산과 폰트가 붙은 상태로 열어야 임포트가 실제 화면과 같은 결과를 낸다.
    await writeFile(tmp, shell(html), 'utf8');
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ content: bundle });

    const { doc, note } = await page.evaluate(
      ([h, o, i, n, p]) => {
        const fresh = window.KGAudit.ingestHtml(h, o, i, n);
        // 제목은 사람이 바꿔 두었을 수 있다. 이미 있는 장표면 그 이름을 지킨다.
        if (p?.title) fresh.title = p.title;
        return window.KGAudit.mergeIngest(fresh, p);
      },
      [html, origin, id, new Date().toISOString(), prev],
    );

    await writeFile(slideFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    const entry = { id, title: doc.title, origin, updatedAt: doc.updatedAt };
    if (existing) {
      Object.assign(existing, entry);
    } else {
      const at = await page.evaluate(
        ([list, o]) => window.KGAudit.placeByOrigin(list, o),
        [deck.slides, origin],
      );
      if (at === undefined) deck.slides.push(entry);
      else deck.slides.splice(at, 0, entry);
    }
    console.log(`${existing ? '갱신' : '추가'} — ${doc.title}  (slides/${id}.kgslide)`);
    if (prev) console.log(`         ${note}`);
  }

  await rm(tmp, { force: true });
} finally {
  await browser.close();
}

deck.updatedAt = new Date().toISOString();
await writeFile(deckPath, `${JSON.stringify(deck, null, 2)}\n`, 'utf8');
console.log(`\ndeck.json 갱신 — 장표 ${deck.slides.length}장`);

/** KG CSS 폴더 안에서 열기 위한 껍데기. preview·lint 와 같은 방식이다. */
function shell(html) {
  const slide = /<section[^>]*class="[^"]*kg-slide[^"]*"[\s\S]*?<\/section>/i.exec(html);
  if (!slide) throw new Error('KG 장표가 아님 — .kg-slide 를 찾지 못했습니다');
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="colors_and_type.css">
<link rel="stylesheet" href="kg-slide.css">
<style>html,body{margin:0;}${css}</style></head>
<body>${slide[0].replace(/(?:\.\.\/)*assets\//g, 'assets/')}</body></html>`;
}
