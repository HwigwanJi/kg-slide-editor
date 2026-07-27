/**
 * 렌더 — 문서 하나로 캔버스 DOM 전체를 다시 만든다.
 *
 * render(mount, doc) 는 순수하다: 같은 문서를 넣으면 항상 같은 DOM이 나온다.
 * 부분 갱신을 하지 않는 이유는 상태가 DOM에 남아 진실이 둘이 되는 것을 막기 위해서다.
 *
 * 레이아웃이 흔들리지 않게 하는 세 가지 장치가 여기 있다.
 *  1. 떼어낼 때 원래 자리에 같은 크기의 빈 자리를 남긴다 → 주변 요소가 밀리지 않는다.
 *  2. 미세 이동은 transform 으로만 한다 → 리플로가 일어나지 않는다.
 *  3. 선택 표시는 DOM 바깥 오버레이가 그린다 → 장표 안 박스 크기에 영향이 없다.
 */
import type { LayoutPatch, SlideDoc, StylePatch } from '@contract/index';
import { ROLE_ATTR, isAdded, toCssColor } from '@contract/index';
import { AUTO_ATTR, ID_ATTR, MARKER_ATTR, MARKER_OFF_ATTR, SLOT_CLASS, byId, stampIds } from './ids';
import { sanitizeInline } from './sanitize';
import { isRemoved } from './tree';

/** 흐름에서 떼어낸 요소가 모이는 층. 슬라이드 루트의 직계 자식이라 좌표계가 캔버스와 같다. */
export const DETACHED_LAYER_CLASS = 'kg-detached-layer';

export interface RenderResult {
  root: HTMLElement;
}

/**
 * 장표 혼자서는 알 수 없는 값. 덱이 쥐고 있다가 그릴 때 넘겨 준다.
 * 쪽번호를 장표에 박아 두면 순서를 바꿀 때마다 전부 손으로 고쳐야 한다.
 */
export interface RenderContext {
  page?: number;
  total?: number;
}

export function render(mount: HTMLElement, doc: SlideDoc, ctx: RenderContext = {}): RenderResult {
  mount.innerHTML = doc.source.html;
  const root = mount.querySelector<HTMLElement>('.kg-slide');
  if (!root) throw new Error('원본 HTML에 .kg-slide 요소가 없음');

  stampIds(root);
  fillAuto(root, ctx);
  removeTombstoned(root, doc);
  const layer = materializeAdded(root, doc);
  applyAppearance(root, doc);
  placeDetached(root, doc, layer);
  return { root };
}

/* ------------------------------------------------------------------ */
/* 1. 존재 — 지워진 것과 추가된 것                                       */
/* ------------------------------------------------------------------ */

/** 자동 자리를 채운다. 값을 모르면 손대지 않는다 — 원본 표기가 그대로 남는다. */
function fillAuto(root: HTMLElement, ctx: RenderContext): void {
  for (const el of root.querySelectorAll<HTMLElement>(`[${AUTO_ATTR}]`)) {
    const field = el.getAttribute(AUTO_ATTR);
    const value =
      field === 'page' ? ctx.page
      : field === 'total' ? ctx.total
      : field === 'page/total' && ctx.page && ctx.total ? `${ctx.page} / ${ctx.total}`
      : undefined;
    if (value !== undefined) el.textContent = String(value);
  }
}

function removeTombstoned(root: HTMLElement, doc: SlideDoc): void {
  for (const id of doc.tree.removed) byId(root, id)?.remove();
}

function ensureLayer(root: HTMLElement): HTMLElement {
  const existing = root.querySelector<HTMLElement>(`.${DETACHED_LAYER_CLASS}`);
  if (existing) return existing;
  const layer = document.createElement('div');
  layer.className = DETACHED_LAYER_CLASS;
  root.appendChild(layer);
  return layer;
}

/** 추가 노드(삽입·복제)를 실제 요소로 만든다. 항상 떼어낸 층에 놓인다. */
function materializeAdded(root: HTMLElement, doc: SlideDoc): HTMLElement | null {
  const entries = Object.entries(doc.tree.added);
  if (entries.length === 0 && doc.stack.length === 0) return null;
  const layer = ensureLayer(root);

  for (const [id, node] of entries) {
    const tpl = document.createElement('template');
    tpl.innerHTML = node.html.trim();
    const el = tpl.content.firstElementChild;
    if (!(el instanceof HTMLElement)) continue;
    el.removeAttribute('style');
    stampIds(el, id);
    layer.appendChild(el);
  }
  return layer;
}

/* ------------------------------------------------------------------ */
/* 2. 모양 — 글자와 서식                                                */
/* ------------------------------------------------------------------ */

function applyAppearance(root: HTMLElement, doc: SlideDoc): void {
  for (const [id, patch] of Object.entries(doc.patches)) {
    if (isRemoved(doc, id)) continue;
    const el = byId(root, id);
    if (!el) continue;
    if (patch.hidden) {
      el.style.visibility = 'hidden';
      continue;
    }
    if (patch.role) el.setAttribute(ROLE_ATTR, patch.role);
    if (patch.text) el.innerHTML = sanitizeInline(patch.text.html);
    if (patch.style) applyStyle(el, patch.style);
    if (patch.style?.marker !== undefined) applyMarker(el, patch.style.marker);
    if (patch.layout?.mode === 'flow') applyFlowOffset(el, patch.layout);
  }
}

function applyStyle(el: HTMLElement, s: StylePatch): void {
  if (s.color) el.style.color = toCssColor(s.color);
  if (s.gradient) {
    const g = s.gradient;
    el.style.background = `linear-gradient(${g.angle}deg, ${toCssColor(g.from)}, ${toCssColor(g.to)})`;
  } else if (s.background) {
    el.style.background = toCssColor(s.background);
  }
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

/**
 * 노드 말머리표.
 * 빈 문자열은 "이 요소만 끈다"는 뜻이라 위계 전역값까지 눌러야 한다.
 * 그래서 값이 있을 때와 없을 때 서로 다른 속성을 쓴다(core/theme.ts 의 규칙과 짝).
 */
function applyMarker(el: HTMLElement, marker: string): void {
  el.removeAttribute(MARKER_ATTR);
  el.removeAttribute(MARKER_OFF_ATTR);
  if (marker === '') el.setAttribute(MARKER_OFF_ATTR, '');
  else el.setAttribute(MARKER_ATTR, marker);
}

/** 흐름 유지 상태의 미세 이동. 주변 요소를 밀지 않도록 transform 으로만 옮긴다. */
function applyFlowOffset(el: HTMLElement, l: LayoutPatch): void {
  const dx = l.dx ?? 0;
  const dy = l.dy ?? 0;
  if (dx === 0 && dy === 0) return;
  el.style.transform = `translate(${dx}px, ${dy}px)`;
}

/* ------------------------------------------------------------------ */
/* 3. 배치 — 떼어낸 요소                                                */
/* ------------------------------------------------------------------ */

/**
 * 떼어낸 요소 배치.
 *
 * 원본 노드는 DOM에서 **옮기지 않는다**. 제자리에 둔 채 절대 배치로 띄운다.
 *
 * 옮기면 안 되는 이유: KG 장표 CSS는 후손 선택자를 많이 쓴다.
 * 예를 들어 `.concl__2step .kgx-flow .n{font-size:13.5px}` 는 조상 `.concl__2step` 이
 * 있어야 걸린다. 요소를 다른 층으로 옮기면 그 조상이 사라져 규칙이 통째로 빠지고,
 * 안쪽 글자가 기본값으로 떨어진다(실측: 13.5px → 10px).
 *
 * 대신 좌표를 담는 그릇(offsetParent)이 슬라이드 루트가 아닐 수 있으므로,
 * 캔버스 좌표를 그 그릇 기준으로 바꿔 넣는다.
 *
 * 추가 노드(삽입·복제)만 전용 층에 둔다. 원래 자리가 없어 잃을 문맥도 없다.
 */
function placeDetached(root: HTMLElement, doc: SlideDoc, layerHint: HTMLElement | null): void {
  const detached = doc.stack.filter((id) => doc.patches[id]?.layout?.mode === 'detached');
  if (detached.length === 0) return;

  const rootRect = root.getBoundingClientRect();
  const scale = rootRect.width / doc.canvas.w || 1;

  detached.forEach((id, index) => {
    const el = byId(root, id);
    const layout = doc.patches[id]?.layout;
    if (!el || !layout) return;

    if (isAdded(id)) {
      const layer = layerHint ?? ensureLayer(root);
      applyDetachedBox(el, layout, index, 0, 0);
      layer.appendChild(el);
      return;
    }

    // 원래 자리에 같은 크기의 빈 자리를 남긴다.
    // 이것이 없으면 형제들이 즉시 위로 밀려 올라가 장표가 통째로 흔들린다.
    if (layout.keepSlot !== false && !el.previousElementSibling?.classList.contains(SLOT_CLASS)) {
      el.insertAdjacentElement('beforebegin', makeSlot(el));
    }

    // 좌표계를 맞춘다. 절대 배치의 기준 상자는 offsetParent 의 안쪽(패딩 상자)이다.
    el.style.position = 'absolute';
    const parent = el.offsetParent as HTMLElement | null;
    let ox = 0;
    let oy = 0;
    if (parent && parent !== root) {
      const pr = parent.getBoundingClientRect();
      const cs = getComputedStyle(parent);
      ox = (pr.left - rootRect.left) / scale + (parseFloat(cs.borderLeftWidth) || 0);
      oy = (pr.top - rootRect.top) / scale + (parseFloat(cs.borderTopWidth) || 0);
    }
    applyDetachedBox(el, layout, index, ox, oy);
  });
}

/** 같은 자리를 차지하는 투명한 사본. 클릭도 받지 않는다. */
function makeSlot(el: HTMLElement): HTMLElement {
  const slot = el.cloneNode(true) as HTMLElement;
  slot.classList.add(SLOT_CLASS);
  slot.removeAttribute(ID_ATTR);
  for (const child of slot.querySelectorAll(`[${ID_ATTR}]`)) child.removeAttribute(ID_ATTR);
  slot.style.visibility = 'hidden';
  slot.style.pointerEvents = 'none';
  return slot;
}

/**
 * 캔버스 절대좌표 고정. 좌표계는 .kg-slide 기준(1280×905)이다.
 * ox·oy 는 좌표를 담는 그릇이 루트가 아닐 때의 보정값이다.
 */
function applyDetachedBox(
  el: HTMLElement, l: LayoutPatch, stackIndex: number, ox: number, oy: number,
): void {
  el.style.position = 'absolute';
  el.style.margin = '0';
  el.style.left = `${(l.x ?? 0) - ox}px`;
  el.style.top = `${(l.y ?? 0) - oy}px`;
  if (l.w !== undefined) el.style.width = `${l.w}px`;
  if (l.h !== undefined) el.style.height = `${l.h}px`;
  el.style.zIndex = String(100 + stackIndex);
  el.style.transform = '';
}

/* ------------------------------------------------------------------ */

/**
 * 요소의 현재 캔버스 좌표. 떼어내기 시 시작 사각형을 잡을 때 쓴다.
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

/** 캔버스 안에서 ID가 찍힌 요소를 모두 나열한다. 개요·검사 화면이 쓴다. */
export function listNodes(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)].filter(
    (el) => !el.closest(`.${SLOT_CLASS}`),
  );
}
