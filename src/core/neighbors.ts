/**
 * 주변 오브젝트 — 캔버스에서 직접 집기 어려운 요소를 목록으로 잡는다.
 *
 * 고밀도 장표에서는 요소가 겹치고 작아서 클릭으로 원하는 것을 고르기가 어렵다.
 * 지금 고른 것을 기준으로 부모·자식·형제·겹치는 것을 늘어놓아, 목록에서 집게 한다.
 * PPT 의 선택 창(Selection Pane)과 같은 역할이다.
 */
import type { NodeId, Role } from '@contract/index';
import { ID_ATTR, SLOT_CLASS, TEXT_ATTR, roleOf } from './ids';

export type Relation = '부모' | '자식' | '형제' | '겹침';

export interface Neighbor {
  id: NodeId;
  role: Role | null;
  relation: Relation;
  /** 목록에 보일 이름. 글자가 있으면 글자, 없으면 클래스. */
  label: string;
  /** 글자를 담고 있는가 — 바로 편집할 수 있는지 표시 */
  editable: boolean;
  /** 캔버스 좌표 사각형 */
  rect: { x: number; y: number; w: number; h: number };
}

const MAX_SIBLINGS = 12;
const MAX_OVERLAPS = 8;

export function neighborsOf(root: HTMLElement, el: HTMLElement, scale: number): Neighbor[] {
  const out: Neighbor[] = [];
  const seen = new Set<NodeId>();
  const add = (node: Element | null, relation: Relation) => {
    if (!(node instanceof HTMLElement)) return;
    const id = node.getAttribute(ID_ATTR);
    if (!id || id === 'n' || seen.has(id) || node === el) return;
    if (node.closest(`.${SLOT_CLASS}`)) return;
    seen.add(id);
    out.push({
      id,
      role: roleOf(node),
      relation,
      label: labelOf(node),
      editable: node.hasAttribute(TEXT_ATTR),
      rect: rectOf(root, node, scale),
    });
  };

  // 부모 사슬 — 묶음 단위로 올라가며 고르고 싶을 때가 많다
  let parent = el.parentElement;
  while (parent && parent !== root.parentElement) {
    add(parent, '부모');
    parent = parent.parentElement;
  }

  for (const child of [...el.children].slice(0, MAX_SIBLINGS)) add(child, '자식');
  for (const sibling of [...(el.parentElement?.children ?? [])].slice(0, MAX_SIBLINGS)) {
    add(sibling, '형제');
  }

  // 화면에서 겹치는 것 — 떼어낸 요소가 위에 얹혀 클릭을 가로챌 때 필요하다
  const box = el.getBoundingClientRect();
  let overlaps = 0;
  for (const other of root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)) {
    if (overlaps >= MAX_OVERLAPS) break;
    if (other === el || seen.has(other.getAttribute(ID_ATTR) ?? '')) continue;
    if (!intersects(box, other.getBoundingClientRect())) continue;
    add(other, '겹침');
    overlaps++;
  }

  return out;
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function labelOf(el: HTMLElement): string {
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 28);
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
