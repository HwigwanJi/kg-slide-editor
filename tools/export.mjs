/**
 * 덱 내보내기 — 덱 순서대로 한 폴더에.
 *
 *   node tools/export.mjs <프로젝트폴더> [--png] [--pdf] [--pptx] [-o 출력폴더]
 *
 * **지금 모습을 굽는다.** 원본(source)만 읽으면 사람이 편집기에서 고친 것이 보이지 않으므로,
 * 검사·미리보기와 같은 번들(KGAudit.currentHtml)을 지나 덧씌움까지 얹은 HTML 을 만든다.
 * 그래야 화면·미리보기·내보내기 셋이 같은 것을 보여 준다.
 *
 * PNG 은 장당 한 장, PDF 는 한 파일에 전부 담는다.
 * PDF 를 장마다 따로 만들어 합치려면 합치는 도구가 필요한데, 한 문서에 모아 한 번에 인쇄하면
 * 그럴 일이 없다. 게다가 이렇게 하면 글자가 이미지가 아니라 벡터로 들어가 검색·복사가 된다.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureBundle } from './bundle.mjs';
import { linkAssets, projectRootOf } from './assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KG_DIR = join(ROOT, 'public', 'kg');
export const CANVAS = { width: 1280, height: 905 };

const pickDeckFile = (dir) => (existsSync(join(dir, 'project.kgproj')) ? 'project.kgproj' : 'deck.json');

/** 파일 이름으로 쓸 수 없는 글자를 걷어낸다. 윈도우가 막는 것들이다. */
const safeName = (s) => (s || '제목 없음').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

/** 덱을 순서대로 편다. 목차에 있으나 파일이 없는 것은 빼고 몇 건인지 알린다. */
async function readDeck(dir) {
  const deck = JSON.parse(await readFile(join(dir, pickDeckFile(dir)), 'utf8'));
  const slides = [];
  const missing = [];
  for (const [i, e] of (deck.slides ?? []).entries()) {
    const file = join(dir, 'slides', `${e.id}.kgslide`);
    if (!existsSync(file)) { missing.push(e.title || e.id); continue; }
    slides.push({ at: i + 1, id: e.id, title: e.title, file });
  }
  return { name: basename(dir), slides, missing };
}

/**
 * 장표 하나를 조각과 장표 전용 CSS 로 가른다.
 *
 * **CSS 를 함께 가져와야 한다.** 격자·간격·모듈 모양이 전부 장표마다 딸린 <style> 에 들어 있어,
 * 조각만 꺼내면 기본 흐름으로 무너진다(칸이 한 줄로 늘어서고 아래로 넘친다).
 * 검사·미리보기가 doc.source.css 를 따로 챙기는 것과 같은 이유다.
 *
 * 자산은 프로젝트 것을 먼저 본다(tools/assets.mjs) — 로고는 스킬, 사업 그림은 프로젝트.
 */
async function pageHtml(page, slide, root) {
  const raw = JSON.parse(await readFile(slide.file, 'utf8'));
  const html = await page.evaluate((d) => window.KGAudit.currentHtml(d), raw);
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  return { body: linkAssets(body ? body[1] : html, root), css };
}

/** KG CSS 폴더 안에 임시 파일로 연다. about:blank 로 넣으면 크로미움이 하위 리소스를 막는다. */
async function openIn(page, html, tag) {
  const tmp = join(KG_DIR, `.export-${process.pid}-${tag}.tmp.html`);
  await writeFile(tmp, html, 'utf8');
  try {
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
  } finally {
    await rm(tmp, { force: true });
  }
}

const SHELL = (body, extra = '') => `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="colors_and_type.css">
<link rel="stylesheet" href="kg-slide.css">
<style>html,body{margin:0;background:#fff;}
.kg-detached-layer{position:absolute;inset:0;pointer-events:none;}
.kg-detached-layer>*{pointer-events:auto;}
${extra}</style></head><body>${body}</body></html>`;

/**
 * 장표 전용 CSS 를 그 쪽 안으로 가둔다.
 *
 * 한 문서에 53장을 모아 인쇄하는데, 장표마다 딸린 CSS 는 `.node` `.rev` 같은 흔한 이름을 쓴다.
 * 작도할 때는 한 장에 하나뿐이라 문제가 없지만, 모아 놓으면 뒷 장표의 규칙이 앞 장표를 덮는다.
 * 그래서 선택자마다 그 쪽의 id 를 앞에 붙여 서로 닿지 않게 한다.
 *
 * @keyframes 안쪽은 선택자가 아니라 진행률(0%·to)이므로 건드리지 않는다.
 */
export function scopeCss(css, scope) {
  const one = (sel) => sel.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith(':root') ? s.replace(':root', scope) : `${scope} ${s}`))
    .join(',');

  let out = '';
  let head = '';       // 아직 { 를 만나지 않은 글자 — 선택자이거나 @규칙 머리
  let depth = 0;       // 중괄호 깊이
  let passUntil = 0;   // 이 깊이로 돌아올 때까지는 손대지 않는다(@keyframes 안쪽)

  for (const ch of css) {
    if (ch === '{') {
      const name = head.trim();
      if (depth === 0) {
        // @media·@supports 는 껍데기만 두고 안쪽을 가둔다. 나머지 @규칙은 통째로 통과시킨다.
        const isNest = /^@(media|supports|layer|container)\b/.test(name);
        const isAt = name.startsWith('@');
        out += `${isAt || isNest ? name : one(name)}{`;
        if (isAt && !isNest) passUntil = 1;
      } else {
        out += `${passUntil ? name : (depth === 1 && !passUntil ? one(name) : name)}{`;
      }
      head = '';
      depth += 1;
      continue;
    }
    if (ch === '}') {
      out += `${head}}`;
      head = '';
      depth -= 1;
      if (depth < passUntil) passUntil = 0;
      continue;
    }
    head += ch;
  }
  return out + head;
}

/**
 * 덱을 내보낸다.
 * @param dir     프로젝트 폴더
 * @param opts    { png, pdf, out }
 * @param say     진행 알림(선택)
 */
export async function exportDeck(dir, opts = {}, say = () => {}) {
  const project = resolve(dir);
  const { name, slides, missing } = await readDeck(project);
  if (slides.length === 0) throw new Error('내보낼 장표가 없습니다.');

  // 계약이 정한 자리(EXPORT_DIR). preview/ 와 섞지 않는다 — 거기는 편집기가 id 로 찾는 자리다.
  const out = resolve(opts.out ?? join(project, 'export'));
  await mkdir(out, { recursive: true });

  const bundle = await readFile(ensureBundle('audit'), 'utf8');
  const browser = await chromium.launch();
  const made = [];
  try {
    const page = await browser.newPage({ viewport: CANVAS, deviceScaleFactor: 2 });
    await page.setContent('<!DOCTYPE html><html><body></body></html>');
    await page.addScriptTag({ content: bundle });

    // 굽는 것은 한 번만 한다. PNG 과 PDF 가 같은 HTML 을 쓴다 — 둘이 갈리면 안 된다.
    const pages = [];
    for (const s of slides) pages.push(await pageHtml(page, s, projectRootOf(project)));

    if (opts.png) {
      const dst = join(out, 'png');
      await mkdir(dst, { recursive: true });
      for (const [i, s] of slides.entries()) {
        // 한 장씩 따로 여니 가둘 필요가 없다. 장표 CSS 를 그대로 얹는다.
        await openIn(page, SHELL(pages[i].body, pages[i].css), `p${i}`);
        const file = join(dst, `${String(s.at).padStart(2, '0')}_${safeName(s.title)}.png`);
        await page.screenshot({ path: file, clip: { x: 0, y: 0, ...CANVAS } });
        say(`PNG ${s.at}/${slides.length}`);
      }
      made.push(`${dst} (${slides.length}장)`);
    }

    if (opts.pdf) {
      // 한 문서에 전부 담아 한 번에 인쇄한다. 장마다 쪽을 끊고, 마지막 뒤에는 빈 쪽을 만들지 않는다.
      // 장표 CSS 는 각자 자기 쪽 안에 가둔다 — 안 그러면 뒷 장표 규칙이 앞 장표를 덮는다.
      const joined = pages
        .map((p, i) => `<div class="kg-page" id="pg${i}">${p.body}</div>`)
        .join('\n');
      const scoped = pages.map((p, i) => scopeCss(p.css, `#pg${i}`)).join('\n');
      await openIn(page, SHELL(joined, `
.kg-page{width:${CANVAS.width}px;height:${CANVAS.height}px;position:relative;overflow:hidden;}
.kg-page{break-after:page;}
.kg-page:last-child{break-after:auto;}
${scoped}`), 'pdf');

      const file = join(out, `${safeName(name)}.pdf`);
      await page.pdf({
        path: file,
        width: `${CANVAS.width}px`,
        height: `${CANVAS.height}px`,
        printBackground: true,
        pageRanges: `1-${slides.length}`,
      });
      made.push(`${file} (${slides.length}쪽)`);
    }
    if (opts.pptx) {
      /*
       * 장당 그림 한 장으로 넣는다.
       *
       * 도형으로 옮기지 않는 이유가 있다. KG 장표는 grid·clip-path·그라데이션·웹폰트로 그려지는데
       * 파워포인트 도형 모델에 1:1 대응이 없어, 옮기면 셰브론·도넛·연결선이 무너진다.
       * 그림으로 넣으면 화면에서 보던 것과 정확히 같다. 편집은 이 편집기에서 하므로 잃는 것이 없다.
       */
      const { default: PptxGenJS } = await import('pptxgenjs');
      const deckOut = new PptxGenJS();
      // 1280×905 를 그대로 담는 규격을 만든다. 기본 16:9 에 넣으면 위아래가 잘린다.
      const inch = (px) => px / 96;
      deckOut.defineLayout({ name: 'KG', width: inch(CANVAS.width), height: inch(CANVAS.height) });
      deckOut.layout = 'KG';

      for (const [i, s] of slides.entries()) {
        await openIn(page, SHELL(pages[i].body, pages[i].css), `x${i}`);
        const shot = await page.screenshot({ clip: { x: 0, y: 0, ...CANVAS } });
        const slide = deckOut.addSlide();
        slide.addImage({
          data: `image/png;base64,${shot.toString('base64')}`,
          x: 0, y: 0, w: inch(CANVAS.width), h: inch(CANVAS.height),
        });
        say(`PPTX ${s.at}/${slides.length}`);
      }
      const file = join(out, `${safeName(name)}.pptx`);
      await deckOut.writeFile({ fileName: file });
      made.push(`${file} (${slides.length}장)`);
    }
  } finally {
    await browser.close();
  }

  return { out, made, count: slides.length, missing };
}

/* ---------- 명령줄 ---------- */

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('-'));
  if (!dir) {
    console.error('프로젝트 폴더가 없습니다.\n  node tools/export.mjs <프로젝트폴더> [--png] [--pdf] [--pptx] [-o 출력폴더]');
    process.exit(2);
  }
  const oi = args.indexOf('-o');
  const png = args.includes('--png');
  const pptx = args.includes('--pptx');
  const pdf = args.includes('--pdf');
  const r = await exportDeck(dir, {
    png: png || (!pdf && !pptx),   // 아무것도 안 고르면 PNG
    pdf,
    pptx,
    ...(oi >= 0 && args[oi + 1] ? { out: args[oi + 1] } : {}),
  }, (m) => process.stderr.write(`\r${m}   `));
  process.stderr.write('\r');
  for (const m of r.made) console.log(m);
  if (r.missing.length) console.error(`목차에 있으나 파일이 없어 뺀 장표 ${r.missing.length}건: ${r.missing.join(', ')}`);
}
