/**
 * 넘침·헐거움 감사 — 박스 밖으로 밀려난 글자와, 반대로 너무 빈 박스를 찾는다.
 *
 * 고밀도 장표에서 가장 자주 나는 사고 두 가지다. 잘린 줄은 화면에서 그냥 안 보이고,
 * 헐거운 박스는 "채우다 만 것"처럼 보인다. 둘 다 눈으로는 놓치기 쉽다.
 *
 * 측정에서 가장 중요한 것은 오탐을 내지 않는 것이다.
 * 잘못된 신호로 글자를 줄이면 멀쩡한 장표가 망가진다. 그래서
 *  - 절대배치된 장식(모서리 번호·배지)은 넘침 계산에서 제외한다.
 *    이것들은 일부러 박스 밖으로 나가 있고, scrollHeight 를 부풀린다.
 *  - 줄높이 반올림과 글꼴 힌팅이 만드는 1~2px 는 허용 오차로 흡수한다.
 * 두 값 모두 프로젝트 설정(kg.config.json)에서 온다.
 */
import type { NodeId, ProjectSettings, StylePatch } from '@contract/index';
import { DEFAULT_SETTINGS, floorFor } from '@contract/index';
import { ID_ATTR, SLOT_ATTR, SLOT_CLASS, TEXT_ATTR, roleOf } from './ids';

export type IssueKind = 'clipped' | 'outside' | 'sparse' | 'tooSmall' | 'overlap';

export interface OverflowIssue {
  id: NodeId;
  /** 어느 장표에서 났는가. 덱 전체 검사에서 채워진다. */
  slideId?: string;
  kind: IssueKind;
  overY: number;
  overX: number;
  preview: string;
  /** 사람이 읽을 설명 */
  detail: string;
}

/* ------------------------------------------------------------------ */
/* 측정                                                                */
/* ------------------------------------------------------------------ */

interface Box { top: number; right: number; bottom: number; left: number }

function contentBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const n = (v: string) => parseFloat(v) || 0;
  return {
    top: r.top + n(cs.borderTopWidth) + n(cs.paddingTop),
    right: r.right - n(cs.borderRightWidth) - n(cs.paddingRight),
    bottom: r.bottom - n(cs.borderBottomWidth) - n(cs.paddingBottom),
    left: r.left + n(cs.borderLeftWidth) + n(cs.paddingLeft),
  };
}

function isFloating(el: Element): boolean {
  const p = getComputedStyle(el).position;
  return p === 'absolute' || p === 'fixed';
}

/**
 * 이 요소가 얼마나 넘쳤는가(px).
 *
 * 절대배치 자식이 하나라도 있으면 scrollHeight 를 믿을 수 없다.
 * 그때는 흐름 안에 있는 자식들만 모아 재고, 없으면 scroll 값을 그대로 쓴다.
 */
export function measureOverflow(el: HTMLElement): { x: number; y: number } {
  const children = [...el.children];
  const floating = children.filter(isFloating);

  if (floating.length === 0 || children.length === floating.length) {
    return { x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight };
  }

  const box = contentBox(el);
  let right = box.left;
  let bottom = box.top;
  for (const child of children) {
    if (isFloating(child)) continue;
    const r = child.getBoundingClientRect();
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return { x: right - box.right, y: bottom - box.bottom };
}

/** 박스 안에서 내용이 차지하는 세로 비율. 1 에 가까울수록 꽉 찼다. */
export function fillRatio(el: HTMLElement): number {
  const children = [...el.children].filter((c) => !isFloating(c));
  if (children.length === 0) return 1;
  const box = contentBox(el);
  const height = box.bottom - box.top;
  if (height <= 0) return 1;

  let top = Infinity;
  let bottom = -Infinity;
  for (const child of children) {
    const r = child.getBoundingClientRect();
    if (r.height === 0) continue;
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  if (!Number.isFinite(top)) return 1;
  return Math.min(1, (bottom - top) / height);
}

/* ------------------------------------------------------------------ */
/* 감사                                                                */
/* ------------------------------------------------------------------ */

export function auditOverflow(
  root: HTMLElement,
  slideId?: string,
  settings: ProjectSettings = DEFAULT_SETTINGS,
): OverflowIssue[] {
  const issues: OverflowIssue[] = [];
  const slide = root.getBoundingClientRect();
  const eps = settings.overflowTolerance;

  for (const el of root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)) {
    if (el.closest(`.${SLOT_CLASS}`)) continue;
    const id = el.getAttribute(ID_ATTR)!;
    const base = { id, preview: preview(el), ...(slideId ? { slideId } : {}) };

    /*
     * 1) 박스 안에서 잘림.
     *
     * 스스로 넘침을 감추는 요소만 본다. 글자 요소는 제외한다 —
     * line-height 가 1 에 가까우면 글리프가 줄상자를 넘어 scrollHeight 가 늘 커진다.
     * 그것을 잘림으로 잡으면 여백이 충분한 박스의 글자까지 줄이게 된다.
     * 실제로 잘리는 것은 감추는 조상이 있을 때뿐이고, 그 조상에서 잡힌다.
     */
    const clips = getComputedStyle(el).overflow !== 'visible';
    if (clips) {
      const { x, y } = measureOverflow(el);
      if (y > eps || x > eps) {
        issues.push({
          ...base, kind: 'clipped',
          overY: Math.max(0, Math.round(y)), overX: Math.max(0, Math.round(x)),
          detail: '내용이 박스보다 커서 잘립니다.',
        });
        continue;
      }
    }

    // 2) 글자가 프로젝트 하한보다 작음. 도형 슬롯은 도형 좌표계라 px 기준이 다르다.
    if (el.hasAttribute(TEXT_ATTR) && !el.hasAttribute(SLOT_ATTR)) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      const floor = floorFor(settings, roleOf(el));
      if (size + 0.01 < floor) {
        issues.push({
          ...base, kind: 'tooSmall', overY: 0, overX: 0,
          detail: `${round(size)}px — 프로젝트 하한 ${floor}px 미만입니다.`,
        });
      }
    }

    // 3) 장표 경계 밖
    const r = el.getBoundingClientRect();
    const outX = Math.max(0, r.right - slide.right, slide.left - r.left);
    const outY = Math.max(0, r.bottom - slide.bottom, slide.top - r.top);
    if (outX > eps || outY > eps) {
      issues.push({
        ...base, kind: 'outside',
        overY: Math.round(outY), overX: Math.round(outX),
        detail: '장표 경계를 벗어났습니다.',
      });
      continue;
    }

    // 4) 너무 헐거운 박스 — 채우다 만 것처럼 보인다
    if (clips || el.children.length >= 2) {
      const area = r.width * r.height;
      if (area >= settings.minBoxAreaForFill) {
        const ratio = fillRatio(el);
        if (ratio < settings.minFillRatio) {
          issues.push({
            ...base, kind: 'sparse', overY: 0, overX: 0,
            detail: `내용이 박스의 ${Math.round(ratio * 100)}%만 채웁니다. 간격을 넓히거나 내용을 보강해야 합니다.`,
          });
        }
      }
    }
  }
  issues.push(...auditOverlap(root, slideId));
  return issues;
}

/**
 * 글자끼리 포개진 자리.
 *
 * 이걸 따로 두는 까닭이 있다. 앞의 검사들은 **한 요소가 제 상자 안에 있는가**를 본다.
 * 그래서 두 덩어리가 같은 자리에 나란히 그려져도 각자는 멀쩡해 아무것도 안 걸린다.
 * 실제로 한 장표에서 오른쪽 아래 네 덩어리가 통째로 포개져 글자가 뭉개졌는데
 * 검사는 "이상 없음" 이라고 답했다 — 눈으로 본 장표만 잡히고 나머지는 그대로 나갔다.
 *
 * 글자끼리만 본다. 도형·배경이 겹치는 것은 설계이고(셰브론·배지·화살표), 읽는 데
 * 문제가 되는 것은 글자 위에 글자가 오는 경우뿐이다.
 */
export function auditOverlap(root: HTMLElement, slideId?: string): OverflowIssue[] {
  const runs = [...root.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`)]
    .filter((el) => !el.closest(`.${SLOT_CLASS}`))
    // 도형 안 글자는 SVG 좌표계라 화면 사각형이 겹쳐 보여도 실제로는 안 겹친다.
    .filter((el) => !el.hasAttribute(SLOT_ATTR))
    .filter((el) => (el.textContent ?? '').trim().length > 0)
    .filter((el) => getComputedStyle(el).visibility !== 'hidden')
    .map((el) => ({ el, id: el.getAttribute(ID_ATTR)!, rects: glyphRects(el) }))
    .filter((b) => b.rects.length > 0);

  const issues: OverflowIssue[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i]!;
      const b = runs[j]!;
      // 조상·자손은 원래 겹친다.
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;

      const hit = worstOverlap(a.rects, b.rects);
      if (!hit) continue;

      const key = `${a.id}|${b.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      issues.push({
        id: a.id,
        kind: 'overlap',
        overY: hit.h,
        overX: hit.w,
        preview: preview(a.el),
        detail: `"${preview(b.el)}" 와 겹칩니다 — 가로 ${hit.w}px · 세로 ${hit.h}px.`,
        ...(slideId ? { slideId } : {}),
      });
    }
  }
  return issues;
}

/**
 * 글자가 실제로 차지하는 자리.
 *
 * 요소 사각형으로 재면 안 된다. 가운데 정렬된 제목의 상자는 칸 전체만큼 넓은데,
 * 모서리에 놓인 번호 배지가 그 상자와 겹친다고 잡힌다 — 눈으로는 닿지도 않은 것들이다.
 * 실제로 그렇게 재 보니 멀쩡한 배지 다섯 건이 겹침으로 올라왔다.
 * Range 로 재면 줄마다 글자에 딱 붙은 사각형이 나오므로 그 일이 없다.
 */
function glyphRects(el: HTMLElement): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  return [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
}

/**
 * 두 글자 덩어리가 가장 크게 물린 자리. 없으면 null.
 *
 * 줄상자는 글리프보다 위아래로 크게 잡히므로 붙어 있는 두 줄이 늘 1~2px 물린다.
 * 그것까지 잡으면 멀쩡한 장표마다 수십 건이 뜬다. 작은 쪽 줄의 넓이를
 * 4분의 1 넘게 덮었을 때만 포개진 것으로 본다.
 */
function worstOverlap(as: DOMRect[], bs: DOMRect[]): { w: number; h: number } | null {
  let best: { w: number; h: number; area: number } | null = null;
  for (const a of as) {
    for (const b of bs) {
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w <= OVERLAP_EPS || h <= OVERLAP_EPS) continue;
      const area = w * h;
      if (area < Math.min(a.width * a.height, b.width * b.height) * 0.25) continue;
      if (!best || area > best.area) best = { w: Math.round(w), h: Math.round(h), area };
    }
  }
  return best ? { w: best.w, h: best.h } : null;
}

/** 줄상자가 물리는 정도. 이보다 작으면 스친 것이다. */
const OVERLAP_EPS = 3;

function preview(el: HTMLElement): string {
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 32);
  const cls = el.classList[0];
  return cls ? `.${cls}` : el.tagName.toLowerCase();
}

/* ------------------------------------------------------------------ */
/* 고침 후보                                                            */
/* ------------------------------------------------------------------ */

export type FixKind =
  | 'fontSize' | 'letterSpacing' | 'lineHeight' | 'padding' | 'boxHeight' | 'raiseFont' | 'gap';

export interface FixOption {
  kind: FixKind;
  label: string;
  /** 사람이 보는 변화. "17px → 15.5px" */
  change: string;
  /** 원래 값에서 얼마나 벗어나는가(0~1). 작을수록 원본을 덜 건드린다. */
  cost: number;
  style?: StylePatch;
  rect?: { h?: number; w?: number };
}

/**
 * 이 요소의 문제를 푸는 방법들.
 *
 * 값을 실제로 넣어 보고 넘침이 사라지는지 재는 방식이다. 계산으로 추정하면
 * 줄바꿈·글꼴 힌팅 때문에 빗나간다. 측정이 끝나면 인라인 값을 원래대로 되돌린다.
 * 글자 크기는 프로젝트 하한 아래로 절대 내려가지 않는다.
 */
export function fixOptions(
  el: HTMLElement,
  settings: ProjectSettings = DEFAULT_SETTINGS,
): FixOption[] {
  const cs = getComputedStyle(el);
  const startSize = parseFloat(cs.fontSize);
  const floor = floorFor(settings, roleOf(el));
  const eps = settings.overflowTolerance;
  const fits = () => {
    const { x, y } = measureOverflow(el);
    return y <= eps && x <= eps;
  };

  // 하한보다 작으면 줄이는 게 아니라 키우는 것이 답이다.
  if (startSize + 0.01 < floor) {
    return [{
      kind: 'raiseFont', label: '프로젝트 하한까지 키우기',
      change: `${round(startSize)}px → ${floor}px`, cost: 0,
      style: { fontSize: floor },
    }];
  }
  if (fits()) return sparseOptions(el, settings);

  const startSpacing = (parseFloat(cs.letterSpacing) || 0) / (startSize || 1);
  const startLine = (parseFloat(cs.lineHeight) || startSize * 1.5) / (startSize || 1);
  const startPad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft]
    .map((v) => Math.round(parseFloat(v) || 0)) as [number, number, number, number];

  const saved = el.getAttribute('style') ?? '';
  const out: FixOption[] = [];

  try {
    sweep(el, 'fontSize', startSize, floor, -0.5, (v) => `${v}px`, fits, (v) => {
      out.push({
        kind: 'fontSize', label: '글자 크기 줄이기',
        change: `${round(startSize)}px → ${round(v)}px`,
        cost: (startSize - v) / Math.max(1, startSize - floor),
        style: { fontSize: round(v) },
      });
    });

    sweep(el, 'letterSpacing', startSpacing, settings.minLetterSpacing, -0.005, (v) => `${v}em`, fits, (v) => {
      out.push({
        kind: 'letterSpacing', label: '자간 좁히기',
        change: `${round3(startSpacing)}em → ${round3(v)}em`,
        cost: Math.abs(v - startSpacing) / Math.max(0.005, Math.abs(settings.minLetterSpacing)),
        style: { letterSpacing: round3(v) },
      });
    });

    sweep(el, 'lineHeight', startLine, settings.minLineHeight, -0.05, (v) => String(v), fits, (v) => {
      out.push({
        kind: 'lineHeight', label: '행간 좁히기',
        change: `${round3(startLine)} → ${round3(v)}`,
        cost: (startLine - v) / Math.max(0.05, startLine - settings.minLineHeight),
        style: { lineHeight: round3(v) },
      });
    });

    if (startPad[0] + startPad[2] > 4) {
      for (let ratio = 0.8; ratio >= 0.3; ratio -= 0.1) {
        const pad: [number, number, number, number] = [
          Math.round(startPad[0] * ratio), startPad[1], Math.round(startPad[2] * ratio), startPad[3],
        ];
        el.style.padding = pad.map((v) => `${v}px`).join(' ');
        if (fits()) {
          out.push({
            kind: 'padding', label: '위아래 여백 줄이기',
            change: `${startPad[0]}·${startPad[2]}px → ${pad[0]}·${pad[2]}px`,
            cost: 1 - ratio, style: { padding: pad },
          });
          break;
        }
      }
      el.style.padding = '';
    }

    const needed = Math.ceil(el.scrollHeight);
    const current = Math.round(el.getBoundingClientRect().height);
    if (needed > current) {
      out.push({
        kind: 'boxHeight', label: '박스 높이 늘리기',
        change: `${current}px → ${needed}px`,
        cost: (needed - current) / Math.max(1, current),
        rect: { h: needed },
      });
    }
  } finally {
    if (saved) el.setAttribute('style', saved);
    else el.removeAttribute('style');
  }

  return out.sort((a, b) => a.cost - b.cost);
}

/** 헐거운 박스를 채우는 방법. 글자를 키우거나 여백을 늘려 균형을 맞춘다. */
function sparseOptions(el: HTMLElement, settings: ProjectSettings): FixOption[] {
  const ratio = fillRatio(el);
  if (ratio >= settings.minFillRatio) return [];

  const cs = getComputedStyle(el);
  const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft]
    .map((v) => Math.round(parseFloat(v) || 0)) as [number, number, number, number];
  const gapNow = Math.round(parseFloat(cs.rowGap) || 0);
  const slack = (el.getBoundingClientRect().height) * (1 - ratio);
  const kids = Math.max(1, [...el.children].length - 1);

  const out: FixOption[] = [];
  if (kids > 1) {
    out.push({
      kind: 'gap', label: '요소 사이 간격 넓히기',
      change: `${gapNow}px → ${Math.round(gapNow + slack / kids)}px`,
      cost: 0.2,
      style: { padding: pad },
    });
  }
  out.push({
    kind: 'padding', label: '박스 여백 늘려 균형 맞추기',
    change: `${pad[0]}px → ${Math.round(pad[0] + slack / 4)}px`,
    cost: 0.3,
    style: {
      padding: [
        Math.round(pad[0] + slack / 4), pad[1], Math.round(pad[2] + slack / 4), pad[3],
      ],
    },
  });
  return out;
}

/** 한 속성을 단계적으로 바꿔 가며 넘침이 사라지는 첫 값을 찾는다. */
function sweep(
  el: HTMLElement,
  prop: 'fontSize' | 'letterSpacing' | 'lineHeight',
  from: number,
  to: number,
  step: number,
  format: (v: number) => string,
  fits: () => boolean,
  hit: (v: number) => void,
): void {
  const original = el.style[prop];
  for (let v = from + step; v >= to; v += step) {
    el.style[prop] = format(round3(v));
    if (fits()) {
      hit(round3(v));
      break;
    }
  }
  el.style[prop] = original;
}

/**
 * 글자를 줄여 박스에 맞추는 최소 크기.
 * 일괄 보정처럼 하나만 고를 때 쓴다. 세밀한 선택은 fixOptions 를 쓴다.
 */
export function fitFontSize(
  el: HTMLElement,
  settings: ProjectSettings = DEFAULT_SETTINGS,
): number | null {
  const floor = floorFor(settings, roleOf(el));
  const original = el.style.fontSize;
  const start = parseFloat(getComputedStyle(el).fontSize);
  const eps = settings.overflowTolerance;
  try {
    for (let size = start - 0.5; size >= floor; size -= 0.5) {
      el.style.fontSize = `${size}px`;
      const { x, y } = measureOverflow(el);
      if (y <= eps && x <= eps) return round(size);
    }
    return null;
  } finally {
    el.style.fontSize = original;
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
