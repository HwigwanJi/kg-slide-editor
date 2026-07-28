/**
 * KG 브랜드 토큰 레지스트리.
 *
 * 토큰의 진실은 public/kg/colors_and_type.css 의 :root 블록 하나다.
 * 여기에 팔레트를 복사해 두면 진실이 둘이 되므로, 실행 시점에 그 CSS를 읽어 목록을 만든다.
 * 색상 선택 UI는 이 목록만 보고 그린다. (하드코딩 hex 금지)
 */
import type { ColorRef } from './style';

export interface KgToken {
  /** CSS 변수명에서 `--` 를 뗀 이름. 예: navy-800 */
  name: string;
  /** 계약에 저장되는 형태. 예: token:navy-800 */
  ref: ColorRef;
  /** colors_and_type.css 에 적힌 원래 값. 미리보기용이며 저장하지 않는다. */
  value: string;
  /** 이름 접두사로 나눈 묶음. 예: navy / blue / ink / gray / neutral / red / green / amber */
  group: string;
}

const COLOR_VALUE = /^(#|rgb|hsl|transparent)/i;

/** `token:navy-800` → `var(--navy-800)` */
export function toCssColor(ref: ColorRef): string {
  return ref.startsWith('token:') ? `var(--${ref.slice(6)})` : ref;
}

/** CSS 원문의 :root 블록에서 색상 토큰만 뽑는다. */
export function parseKgTokens(cssText: string): KgToken[] {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(cssText);
  if (!root?.[1]) return [];
  const out: KgToken[] = [];
  const decl = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (let m = decl.exec(root[1]); m; m = decl.exec(root[1])) {
    const name = m[1]!;
    const value = m[2]!.trim();
    if (!COLOR_VALUE.test(value)) continue;
    out.push({ name, ref: `token:${name}` as ColorRef, value, group: name.split('-')[0]! });
  }
  return out;
}

let cache: KgToken[] | null = null;

/** 브랜드 토큰 목록. 첫 호출에서 CSS를 한 번 읽고 캐시한다. */
export async function loadKgTokens(href: string): Promise<KgToken[]> {
  if (cache) return cache;
  const res = await fetch(href);
  if (!res.ok) throw new Error(`KG 토큰 CSS를 읽지 못함: ${href} (${res.status})`);
  cache = parseKgTokens(await res.text());
  return cache;
}

