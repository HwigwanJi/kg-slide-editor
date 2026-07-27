#!/usr/bin/env node
/**
 * 목차 체계 정리 — 발주처 목차에 맞춰 머리말 번호를 다시 매긴다.
 *
 *   node tools/목차정리.mjs <프로젝트폴더>          무엇이 바뀌는지만 보여 준다
 *   node tools/목차정리.mjs <프로젝트폴더> --fix    커맨드를 발행해 실제로 고친다
 *
 * 고치는 것은 셋뿐이다. 장(우상단 로마자·이름)과 절(좌상단 번호).
 * **HTML 을 다시 그리지 않는다.** setText 커맨드로 보낸다(DECISIONS D2) — 그래야 사람이
 * 쌓아 둔 편집분이 살아남고, 실행취소·검증이 사람이 누르는 것과 같은 통로를 지난다.
 *
 * 규칙
 *   장   발주처 목차 4개(Ⅰ~Ⅳ)에 배정한다. 로마자는 전각 한 벌(U+2160~)로 통일한다 —
 *        지금은 `Ⅲ`(U+2162)과 `III`(영문 3자)이 섞여 있어 검색도 정렬도 되지 않는다.
 *   절   장 안에서 1부터. **제목이 바뀔 때 올라간다.** 같은 제목이 여러 장 이어지면 한 절이다
 *        (한 주제를 여러 장에 걸쳐 설명하는 것이 이 덱의 짜임이다).
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 발주처 목차. 여기가 장의 진실이다. */
const CHAPTERS = [
  { roman: 'Ⅰ', name: '과업 개요' },
  { roman: 'Ⅱ', name: '제안사 소개' },
  { roman: 'Ⅲ', name: '과업 수행계획' },
  { roman: 'Ⅳ', name: '기타' },
];

/**
 * 장표를 어느 장에 넣을지. 쪽 번호 구간으로 정한다.
 * 덱 순서가 곧 발표 순서이므로, 장이 뒤섞이지 않으려면 구간으로 끊는 것이 맞다.
 */
const RANGES = [
  { upto: 2, ch: 0 },   //  1– 2  발주기관 이해 · 제안 목적과 범위
  { upto: 7, ch: 1 },   //  3– 7  일반현황 · 참여인력 · 특장점 · 수행사례
  { upto: 47, ch: 2 },  //  8–47  경영환경 분석 ~ 과업 관리 · 보안
  { upto: 999, ch: 3 }, // 48–    사후관리 · 유상무상 지원 · 제안 요약
];
const chapterOf = (at) => CHAPTERS[RANGES.find((r) => at <= r.upto).ch];

const pickDeckFile = (dir) => (existsSync(join(dir, 'project.kgproj')) ? 'project.kgproj' : 'deck.json');

const dir = resolve(process.argv[2] ?? '.');
const FIX = process.argv.includes('--fix');
const deck = JSON.parse(await readFile(join(dir, pickDeckFile(dir)), 'utf8'));

/** 머리말 세 자리의 노드 id 와 지금 글자. 구조 경로(n.0.4.0)는 브라우저에서 세어 얻는다. */
const browser = await chromium.launch();
const page = await browser.newPage();
const rows = [];
try {
  for (const [i, e] of (deck.slides ?? []).entries()) {
    const file = join(dir, 'slides', `${e.id}.kgslide`);
    if (!existsSync(file)) continue;
    const doc = JSON.parse(await readFile(file, 'utf8'));
    const found = await page.evaluate((html) => {
      const host = document.createElement('div');
      host.innerHTML = html;
      const root = host.firstElementChild;
      /** core/ids.ts 와 같은 규칙 — 뿌리는 n, 자식은 요소 순번을 점으로 잇는다. */
      const pathOf = (el) => {
        const parts = [];
        for (let cur = el; cur && cur !== root; cur = cur.parentElement) {
          parts.unshift([...cur.parentElement.children].indexOf(cur));
        }
        return `n${parts.length ? `.${parts.join('.')}` : ''}`;
      };
      const at = (sel) => {
        const el = root.querySelector(sel);
        return el ? { id: pathOf(el), text: el.textContent.trim() } : null;
      };
      return {
        num: at('.kg-header__num'),
        roman: at('.kg-chapter-tab__roman'),
        tag: at('.kg-chapter-tag'),
        title: root.querySelector('.kg-section-title')?.textContent.trim() ?? '',
      };
    }, doc.source.html);
    /*
     * 지금 글자는 덧씌움이 이긴다.
     *
     * source.html 은 작도한 그대로라, 이미 고쳐 둔 것을 여기서 읽으면 매번 "바꿀 것이 있다" 고
     * 나온다. 무엇이 남았는지 셀 수 없게 되므로 patches 를 먼저 본다.
     */
    const now = (node) => {
      if (!node) return node;
      const patched = doc.patches?.[node.id]?.text?.html;
      return patched == null ? node : { ...node, text: String(patched).replace(/<[^>]+>/g, '').trim() };
    };
    rows.push({
      at: i + 1, id: e.id, file, title: found.title,
      num: now(found.num), roman: now(found.roman), tag: now(found.tag),
    });
  }
} finally {
  await browser.close();
}

/* ---------- 절 번호: 장 안에서 제목이 바뀔 때 올라간다 ---------- */

let lastCh = null;
let lastTitle = null;
let sec = 0;
for (const r of rows) {
  const ch = chapterOf(r.at);
  if (ch !== lastCh) { sec = 0; lastTitle = null; lastCh = ch; }
  if (r.title !== lastTitle) { sec += 1; lastTitle = r.title; }
  r.want = { roman: ch.roman, tag: ch.name, num: String(sec).padStart(2, '0') };
}

/* ---------- 무엇이 바뀌는가 ---------- */

const cmdsBySlide = new Map();
let changes = 0;
for (const r of rows) {
  const cmds = [];
  for (const key of ['roman', 'tag', 'num']) {
    const node = r[key];
    if (!node) continue;
    if (node.text === r.want[key]) continue;
    cmds.push({ type: 'setText', id: node.id, html: r.want[key] });
    changes += 1;
  }
  if (cmds.length) cmdsBySlide.set(r.file, cmds);
}

console.log('쪽  장          절   제목');
console.log('-'.repeat(74));
for (const r of rows) {
  const mark = (k) => (r[k] && r[k].text !== r.want[k] ? '*' : ' ');
  console.log(
    String(r.at).padStart(3),
    `${mark('roman')}${r.want.roman} ${r.want.tag}`.padEnd(14),
    `${mark('num')}${r.want.num}`.padEnd(5),
    r.title.slice(0, 34),
  );
}
console.log(`\n바꿀 글자 ${changes}건 · 장표 ${cmdsBySlide.size}장  (* 표시가 바뀌는 자리)`);

if (!FIX) {
  console.log('\n--fix 를 붙이면 setText 커맨드로 실제 고칩니다. 지금은 아무것도 바꾸지 않았습니다.');
  process.exit(0);
}

/* ---------- 고친다 ---------- */

const { execFileSync } = await import('node:child_process');
const tmp = join(ROOT, `.목차정리-${process.pid}.json`);
let done = 0;
for (const [file, cmds] of cmdsBySlide) {
  await writeFile(tmp, JSON.stringify(cmds), 'utf8');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'apply.mjs'), file, '--cmds', tmp], { stdio: 'pipe' });
  done += 1;
  process.stderr.write(`\r고치는 중 ${done}/${cmdsBySlide.size}   `);
}
await writeFile(tmp, '', 'utf8');
const { rm } = await import('node:fs/promises');
await rm(tmp, { force: true });
process.stderr.write('\r');
console.log(`고쳤습니다 — 장표 ${done}장 · 글자 ${changes}건`);
console.log('편집기를 열어 두었다면 "다시 읽기"를 누르세요.');
