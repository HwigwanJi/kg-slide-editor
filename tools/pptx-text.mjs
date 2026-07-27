#!/usr/bin/env node
/**
 * pptx 에서 글자만 뽑는다.
 *
 * 캡처 이미지로는 작은 글씨·표 안 숫자를 읽을 수 없다. 원본 pptx 를 열어
 * 슬라이드별 텍스트를 UTF-8 파일로 떨군다. 콘솔로 흘리면 Windows 코드페이지가
 * 한글을 깨뜨리므로 언제나 파일로 쓴다.
 *
 *   node tools/pptx-text.mjs <파일.pptx> [출력.txt]
 *
 * pptx 는 zip 이다. 의존성을 늘리지 않으려고 zip 을 직접 읽는다.
 * 중앙 디렉터리 대신 로컬 헤더를 훑는 방식으로 충분하다 — pptx 는 항상
 * 저장(0) 또는 deflate(8) 둘 중 하나만 쓴다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { inflateRawSync } from 'node:zlib';

/** zip 을 {이름: 내용(Buffer)} 로 편다. */
function unzip(buf) {
  const out = new Map();
  for (let i = 0; i + 4 <= buf.length; ) {
    if (buf.readUInt32LE(i) !== 0x04034b50) { i++; continue; }
    const method = buf.readUInt16LE(i + 8);
    const compressed = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const start = i + 30 + nameLen + extraLen;
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    // 크기가 0 으로 적힌(스트리밍) 항목은 건너뛴다. pptx 본문에는 나오지 않는다.
    if (compressed > 0) {
      const raw = buf.subarray(start, start + compressed);
      try { out.set(name, method === 8 ? inflateRawSync(raw) : raw); } catch { /* 깨진 항목은 무시 */ }
    }
    i = start + compressed;
  }
  return out;
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, '&');

/** 한 도형(<a:p> 문단)을 한 줄로 만든다. 문단이 곧 읽는 단위다. */
function textOf(xml) {
  return [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>|<a:p\b[^>]*\/>/g)]
    .map((m) => [...m[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decode(t[1])).join(''))
    .map((line) => line.trim())
    .filter(Boolean);
}

const [, , src, dst] = process.argv;
if (!src) {
  console.error('사용법: node tools/pptx-text.mjs <파일.pptx> [출력.txt]');
  process.exit(1);
}

const files = unzip(readFileSync(src));
const slides = [...files.keys()]
  .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);

const body = slides.map((name, i) => {
  const lines = textOf(files.get(name).toString('utf8'));
  return `${'='.repeat(60)}\n[${i + 1}쪽] ${name}\n${'='.repeat(60)}\n${lines.join('\n')}`;
}).join('\n\n');

const out = dst ?? `${basename(src, '.pptx')}.txt`;
writeFileSync(out, `${basename(src)} — 슬라이드 ${slides.length}장\n\n${body}\n`, 'utf8');
console.log(`슬라이드 ${slides.length}장 -> ${out}`);
