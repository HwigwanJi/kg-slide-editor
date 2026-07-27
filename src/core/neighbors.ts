/**
 * 주변 오브젝트 — 캔버스에서 직접 집기 어려운 요소를 목록으로 잡는다.
 *
 * 고밀도 장표에서는 요소가 겹치고 작아서 클릭으로 원하는 것을 고르기가 어렵다.
 * 특히 연결선·사다리꼴·셰브론 같은 도형은 얇거나 다른 요소에 가려 손이 닿지 않는다.
 * 지금 고른 것을 기준으로 위·아래·옆과 가까이 있는 것을 늘어놓아, 목록에서 집게 한다.
 * PPT 의 선택 창(Selection Pane)과 같은 역할이다.
 */
import type { NodeId, Role } from '@contract/index';
import { ID_ATTR, SLOT_CLASS, TEXT_ATTR, roleOf } from './ids';

export type Relation = '부모' | '자식' | '형제' | '겹침' | '근처' | '도형';
export type NeighborKind = 'text' | 'shape' | 'group';

export interface Neighbor {
  id: NodeId;
  role: Role | null;
  relation: Relation;
  /** 글자인가 도형인가 묶음인가 — 목록에서 걸러 보기 위한 구분 */
  kind: NeighborKind;
  /** 목록에 보일 이름. 글자가 있으면 글자, 없으면 도형 이름. */
  label: string;
  editable: boolean;
  /** 캔버스 좌표 사각형 */
  rect: { x: number; y: number; w: number; h: number };
}

const MAX_PER_RELATION = 14;
const MAX_TOTAL = 60;
/** 이 거리(px) 안에 있으면 "근처"로 본다. 연결선처럼 붙어 있는 도형을 잡기 위한 것. */
const NEAR_RADIUS = 120;

/**
 * 그래픽 태그. SVG 요소의 tagName 은 소문자이므로 반드시 맞춰 비교한다.
 * 대문자로만 비교하면 <svg> 가 영영 도형으로 잡히지 않는다.
 */
const GRAPHIC_TAGS = new Set(['SVG', 'IMG', 'CANVAS', 'VIDEO']);
const isGraphic = (el: Element): boolean => GRAPHIC_TAGS.has(el.tagName.toUpperCase());

/**
 * 도형인가.
 * 그래픽 태그이거나, 글자가 없는데 눈에 보이는 형태(배경·테두리·잘라내기)를 가진 것.
 * KG 장표의 연결선·사다리꼴·막대는 대부분 여기 걸린다.
 */
function isShape(el: HTMLElement): boolean {
  if (isGraphic(el)) return true;
  // 글자 덩어리를 품고 있으면 묶음이다. 도형은 글자를 담지 않는다.
  if (el.querySelector(`[${TEXT_ATTR}]`)) return false;
  if ((el.textContent ?? '').trim()) return false;
  if (el.querySelector('svg')) return true;

  const cs = getComputedStyle(el);
  if (cs.backgroundImage !== 'none' || cs.clipPath !== 'none') return true;
  if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) return true;
  const bg = cs.backgroundColor;
  if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return true;

  // KG 의 연결선·화살표는 대부분 ::before / ::after 로 그린다.
  // 요소 자체에는 배경도 테두리도 없어서, 가상 요소를 보지 않으면 도형인 줄 알 수 없다.
  for (const pseudo of ['::before', '::after']) {
    const p = getComputedStyle(el, pseudo);
    if (p.content && p.content !== 'none' && p.content !== 'normal') return true;
  }

  // 아주 얇거나 납작한 것은 선으로 본다.
  const r = el.getBoundingClientRect();
  return (r.width > 0 && r.width < 8) || (r.height > 0 && r.height < 8);
}

function kindOf(el: HTMLElement): NeighborKind {
  if (el.hasAttribute(TEXT_ATTR)) return 'text';
  if (isShape(el)) return 'shape';
  return 'group';
}

export function neighborsOf(root: HTMLElement, el: HTMLElement, scale: number): Neighbor[] {
  const out: Neighbor[] = [];
  const seen = new Set<NodeId>();

  const add = (node: Element | null, relation: Relation): boolean => {
    if (out.length >= MAX_TOTAL) return false;
    if (!(node instanceof HTMLElement)) return false;
    const id = node.getAttribute(ID_ATTR);
    if (!id || id === 'n' || seen.has(id) || node === el) return false;
    if (node.closest(`.${SLOT_CLASS}`)) return false;
    const rect = rectOf(root, node, scale);
    if (rect.w < 2 && rect.h < 2) return false;

    seen.add(id);
    out.push({
      id,
      role: roleOf(node),
      relation,
      kind: kindOf(node),
      label: labelOf(node),
      editable: node.hasAttribute(TEXT_ATTR),
      rect,
    });
    return true;
  };

  // 부모 사슬 — 묶음 단위로 올라가며 고르고 싶을 때가 많다
  let parent = el.parentElement;
  while (parent && parent !== root.parentElement) {
    add(parent, '부모');
    parent = parent.parentElement;
  }

  // 자식은 직계뿐 아니라 손자까지 본다. 도형은 대개 한두 겹 안쪽에 들어 있다.
  let taken = 0;
  for (const child of el.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)) {
    if (taken >= MAX_PER_RELATION) break;
    if (add(child, '자식')) taken++;
  }

  taken = 0;
  for (const sibling of el.parentElement?.children ?? []) {
    if (taken >= MAX_PER_RELATION) break;
    if (add(sibling, '형제')) taken++;
  }

  // 겹치거나 가까이 있는 것 — 얇은 연결선과 위에 얹힌 요소가 여기서 잡힌다
  const box = el.getBoundingClientRect();
  const near: { node: HTMLElement; gap: number }[] = [];
  for (const other of root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)) {
    if (other === el || seen.has(other.getAttribute(ID_ATTR) ?? '')) continue;
    const gap = distance(box, other.getBoundingClientRect());
    if (gap / scale <= NEAR_RADIUS) near.push({ node: other, gap });
  }
  near.sort((a, b) => a.gap - b.gap);

  taken = 0;
  for (const { node, gap } of near) {
    if (taken >= MAX_PER_RELATION) break;
    if (add(node, gap === 0 ? '겹침' : '근처')) taken++;
  }

  /*
   * 장표 안의 도형은 거리와 상관없이 전부 넣는다.
   * 연결선·사다리꼴·화살표는 얇거나 다른 요소에 가려 클릭으로는 사실상 집을 수 없다.
   * 목록이 유일한 통로이므로, 가까이 있는 것만 보여 주면 영영 못 고르는 도형이 생긴다.
   */
  taken = 0;
  for (const node of root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)) {
    if (taken >= MAX_PER_RELATION) break;
    if (kindOf(node) !== 'shape') continue;
    if (add(node, '도형')) taken++;
  }

  return out;
}

/** 두 사각형 사이 거리. 겹치면 0. */
function distance(a: DOMRect, b: DOMRect): number {
  const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
  return Math.hypot(dx, dy);
}

function labelOf(el: HTMLElement): string {
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 28);

  if (isGraphic(el) || el.querySelector('svg')) return '연결선·도형';
  if (el.tagName.toUpperCase() === 'IMG') return el.getAttribute('alt') || '이미지';

  const cls = [...el.classList].find((c) => c !== SLOT_CLASS);
  return cls ? `.${cls}` : el.tagName.toLowerCase();
}

function rectOf(root: HTMLElement, el: HTMLElement, scale: number) {
  const r = el.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return {
    x: Math.round((r.left - b.left) / scale),
    y: Math.round((r.top - b.top) / scale),
    w: Math.round(r.width / scale),
    h: Math.round(r.height / scale),
  };
}
