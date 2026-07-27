/**
 * 서식 복사 — 요소에 실제로 걸린 모습을 StylePatch 로 읽어낸다.
 *
 * 문서에 저장된 patch 만 복사하면 "원본 KG 서식 그대로인 박스"를 복사할 때 아무것도 담기지 않는다.
 * 사용자가 기대하는 것은 눈에 보이는 서식이므로 계산된 스타일에서 읽는다.
 *
 * 읽어낸 색은 가능한 한 KG 브랜드 토큰으로 되돌린다. 그래야 붙여넣은 쪽도 브랜드 안에 남는다.
 */
import type { ColorRef, FontWeight, KgToken, StylePatch, TextAlign } from '@contract/index';

const GRADIENT = /linear-gradient\(\s*([\d.]+)deg\s*,\s*([^,]+?)(?:\s+[\d.]+%)?\s*,[\s\S]*?([^,)]+?)(?:\s+[\d.]+%)?\s*\)/;

export function readFormat(el: HTMLElement, tokens: KgToken[]): StylePatch {
  const cs = getComputedStyle(el);
  const toRef = colorMapper(tokens);
  const out: StylePatch = {};

  const color = toRef(cs.color);
  if (color) out.color = color;

  const gradient = parseGradient(cs.backgroundImage, toRef);
  if (gradient) out.gradient = gradient;
  else {
    const bg = toRef(cs.backgroundColor);
    if (bg) out.background = bg;
  }

  const borderWidth = parseFloat(cs.borderTopWidth);
  if (borderWidth > 0) {
    out.borderWidth = round(borderWidth);
    const bc = toRef(cs.borderTopColor);
    if (bc) out.borderColor = bc;
  }

  const radius = parseFloat(cs.borderTopLeftRadius);
  if (radius > 0) out.radius = round(radius);

  out.fontSize = round(parseFloat(cs.fontSize));
  const weight = Number(cs.fontWeight);
  if ([300, 400, 500, 600, 700, 800, 900].includes(weight)) out.fontWeight = weight as FontWeight;

  const lh = parseFloat(cs.lineHeight);
  if (!Number.isNaN(lh) && out.fontSize) out.lineHeight = round(lh / out.fontSize);

  const ls = parseFloat(cs.letterSpacing);
  if (!Number.isNaN(ls) && out.fontSize) out.letterSpacing = round3(ls / out.fontSize);

  if (['left', 'center', 'right', 'justify'].includes(cs.textAlign)) {
    out.textAlign = cs.textAlign as TextAlign;
  }

  out.padding = [
    round(parseFloat(cs.paddingTop)),
    round(parseFloat(cs.paddingRight)),
    round(parseFloat(cs.paddingBottom)),
    round(parseFloat(cs.paddingLeft)),
  ];

  const opacity = parseFloat(cs.opacity);
  if (opacity < 1) out.opacity = round3(opacity);

  return out;
}

/** 서식 붙여넣기에서 제외할 항목을 걸러 낸다. 글자 전용/도형 전용을 나눠 붙일 때 쓴다. */
export type FormatScope = 'all' | 'text' | 'shape';

const TEXT_KEYS: (keyof StylePatch)[] = ['color', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign'];
const SHAPE_KEYS: (keyof StylePatch)[] = ['background', 'gradient', 'borderColor', 'borderWidth', 'radius', 'padding', 'opacity'];

export function scopeFormat(style: StylePatch, scope: FormatScope): StylePatch {
  if (scope === 'all') return style;
  const keys = scope === 'text' ? TEXT_KEYS : SHAPE_KEYS;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (style[k] !== undefined) out[k] = style[k];
  return out as StylePatch;
}

/* ------------------------------------------------------------------ */

function colorMapper(tokens: KgToken[]): (css: string) => ColorRef | undefined {
  const byHex = new Map<string, string>();
  for (const t of tokens) {
    const hex = normalizeHex(t.value);
    if (hex && !byHex.has(hex)) byHex.set(hex, t.name);
  }
  return (css: string) => {
    if (!css || css === 'rgba(0, 0, 0, 0)' || css === 'transparent') return undefined;
    const hex = rgbToHex(css);
    if (!hex) return undefined;
    const name = byHex.get(hex);
    return (name ? `token:${name}` : hex) as ColorRef;
  };
}

function parseGradient(
  backgroundImage: string,
  toRef: (css: string) => ColorRef | undefined,
): StylePatch['gradient'] {
  const m = GRADIENT.exec(backgroundImage);
  if (!m) return undefined;
  const from = toRef(m[2]!.trim());
  const to = toRef(m[3]!.trim());
  if (!from || !to) return undefined;
  return { from, to, angle: Math.round(Number(m[1])) };
}

function normalizeHex(value: string): string | null {
  const v = value.trim();
  if (v.startsWith('#')) {
    const h = v.slice(1);
    if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
    if (h.length >= 6) return `#${h.slice(0, 6)}`.toLowerCase();
    return null;
  }
  return rgbToHex(v);
}

function rgbToHex(css: string): string | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(css);
  if (!m) return css.startsWith('#') ? normalizeHex(css) : null;
  const hex = [m[1], m[2], m[3]]
    .map((n) => Math.round(Number(n)).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`.toLowerCase();
}

function round(n: number): number {
  return Number.isNaN(n) ? 0 : Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Number.isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}
