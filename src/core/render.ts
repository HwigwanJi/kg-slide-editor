/**
 * 렌더 — 문서 하나로 캔버스 DOM 전체를 다시 만든다.
 *
 * render(mount, doc) 는 순수하다: 같은 문서를 넣으면 항상 같은 DOM이 나온다.
 * 부분 갱신을 하지 않는 이유는 상태가 DOM에 남아 진실이 둘이 되는 것을 막기 위해서다.
 * (장표 한 장은 노드 수백 개 규모라 통째로 다시 그려도 부담이 없다)
 *
 * React는 이 DOM을 건드리지 않는다. 캔버스는 여기가, 편집기 껍데기는 React가 소유한다.
 */
import type { LayoutPatch, SlideDoc, StylePatch } from '@contract/index';
import { toCssColor } from '@contract/index';
import { ID_ATTR, byId, stampIds } from './ids';
import { sanitizeInline } from './sanitize';

/** 흐름에서 떼어낸 요소가 모이는 층. 슬라이드 루트의 직계 자식이라 좌표계가 캔버스와 같다. */
export const DETACHED_LAYER_CLASS = 'kg-detached-layer';

export interface RenderResult {
  /** 렌더된 .kg-slide 요소 */
  root: HTMLElement;
}

export function render(mount: HTMLElement, doc: SlideDoc): RenderResult {
  mount.innerHTML = doc.source.html;
  const root = mount.querySelector<HTMLElement>('.kg-slide');
  if (!root) throw new Error('원본 HTML에 .kg-slide 요소가 없음');

  stampIds(root);
  applyPatches(root, doc);
  return { root };
}

function applyPatches(root: HTMLElement, doc: SlideDoc): void {
  // 1) 텍스트·서식 — 제자리에서 적용
  for (const [id, patch] of Object.entries(doc.patches)) {
    const el = byId(root, id);
    if (!el) continue;
    if (patch.hidden) {
      el.style.display = 'none';
      continue;
    }
    if (patch.text) el.innerHTML = sanitizeInline(patch.text.html);
    if (patch.style) applyStyle(el, patch.style);
    if (patch.layout?.mode === 'flow') applyFlowOffset(el, patch.layout);
  }

  // 2) 배치 — 떼어낸 요소를 전용 층으로 옮긴다. stack 순서대로 옮겨야 쌓임이 맞는다.
  const detached = doc.stack.filter((id) => doc.patches[id]?.layout?.mode === 'detached');
  if (detached.length === 0) return;

  const layer = document.createElement('div');
  layer.className = DETACHED_LAYER_CLASS;
  root.appendChild(layer);

  detached.forEach((id, index) => {
    const el = byId(root, id);
    const layout = doc.patches[id]?.layout;
    if (!el || !layout) return;
    applyDetached(el, layout, index);
    layer.appendChild(el);
  });
}

function applyStyle(el: HTMLElement, s: StylePatch): void {
  if (s.color) el.style.color = toCssColor(s.color);
  if (s.background) el.style.background = toCssColor(s.background);
  if (s.borderColor) {
    el.style.borderColor = toCssColor(s.borderColor);
    if (!el.style.borderStyle) el.style.borderStyle = 'solid';
  }
  if (s.borderWidth !== undefined) {
    el.style.borderWidth = `${s.borderWidth}px`;
    if (!el.style.borderStyle) el.style.borderStyle = 'solid';
  }
  if (s.radius !== undefined) el.style.borderRadius = `${s.radius}px`;
  if (s.fontSize !== undefined) el.style.fontSize = `${s.fontSize}px`;
  if (s.fontWeight !== undefined) el.style.fontWeight = String(s.fontWeight);
  if (s.lineHeight !== undefined) el.style.lineHeight = String(s.lineHeight);
  if (s.letterSpacing !== undefined) el.style.letterSpacing = `${s.letterSpacing}em`;
  if (s.textAlign) el.style.textAlign = s.textAlign;
  if (s.padding) el.style.padding = s.padding.map((v) => `${v}px`).join(' ');
  if (s.opacity !== undefined) el.style.opacity = String(s.opacity);
}

/** 흐름 유지 상태의 미세 이동. 주변 요소를 밀지 않도록 transform 으로만 옮긴다. */
function applyFlowOffset(el: HTMLElement, l: LayoutPatch): void {
  const dx = l.dx ?? 0;
  const dy = l.dy ?? 0;
  if (dx === 0 && dy === 0) return;
  el.style.transform = `translate(${dx}px, ${dy}px)`;
}

/** 캔버스 절대좌표 고정. 좌표계는 .kg-slide 기준(1280×905)이다. */
function applyDetached(el: HTMLElement, l: LayoutPatch, stackIndex: number): void {
  el.style.position = 'absolute';
  el.style.margin = '0';
  el.style.left = `${l.x ?? 0}px`;
  el.style.top = `${l.y ?? 0}px`;
  if (l.w !== undefined) el.style.width = `${l.w}px`;
  if (l.h !== undefined) el.style.height = `${l.h}px`;
  el.style.zIndex = String(100 + stackIndex);
  el.style.transform = '';
}

/**
 * 요소의 현재 캔버스 좌표. 떼어내기(detach) 시 시작 사각형을 잡을 때 쓴다.
 * scale 은 캔버스 래퍼에 걸린 CSS 배율이다.
 */
export function canvasRect(
  root: HTMLElement,
  el: HTMLElement,
  scale: number,
): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return {
    x: Math.round((r.left - b.left) / scale),
    y: Math.round((r.top - b.top) / scale),
    w: Math.round(r.width / scale),
    h: Math.round(r.height / scale),
  };
}

/** 캔버스 안에서 ID가 찍힌 요소를 모두 나열한다. 선택 UI가 목록을 만들 때 쓴다. */
export function listNodes(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)];
}
