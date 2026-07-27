/**
 * 노드 식별 — 원본 HTML에 안정 ID와 위계를 찍는다.
 *
 * ID는 DOM 구조 경로다(`n.2.0.1`). 원본이 바뀌지 않는 한 같은 요소는 항상 같은 ID를 얻는다.
 * 저장 문서는 이 ID로만 요소를 가리키므로, 원본 HTML을 다시 파싱해도 패치가 그대로 붙는다.
 *
 * 위계(data-kg-role)는 KG 클래스에서 추론한다. 글자 크기·색을 위계 단위로 다루기 위한 표시다.
 */
import { ROLE_ATTR, ROLE_SELECTORS, type Role } from '@contract/index';

export const ID_ATTR = 'data-kg-id';
/** 원본 style 속성 백업. 재렌더를 원본 기준에서 다시 시작하기 위한 것. */
export const STYLE0_ATTR = 'data-kg-style0';
/** 텍스트 편집 가능 표시 */
export const TEXT_ATTR = 'data-kg-text';
/** 떼어낸 자리에 남는 빈 자리 표시 */
export const SLOT_CLASS = 'kg-slot';

/** 이 태그들만 텍스트 내부 서식으로 인정한다. tiptap 인라인 스키마와 같은 집합이어야 한다. */
export const FORMAT_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR']);

/** 내부로 내려가지 않는 태그. 도형·그래픽은 통째로 하나의 요소로 다룬다. */
const OPAQUE_TAGS = new Set(['SVG', 'CANVAS', 'IMG', 'VIDEO', 'IFRAME']);

/** 인라인으로 흐르는 태그. 편집을 열 때 줄바꿈이 바뀌지 않게 하려면 알아야 한다. */
const INLINE_HOSTS = new Set(['SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'SMALL', 'LABEL']);

export function isInlineHost(el: Element): boolean {
  return INLINE_HOSTS.has(el.tagName);
}

/**
 * 텍스트 편집 대상인가.
 * 자식 요소가 서식 태그뿐이고 실제 글자가 있으면 하나의 텍스트 런으로 본다.
 * SPAN·DIV 자식이 있으면 합성 요소이므로 제외한다(셰브론·칩 묶음 등이 뭉개지는 것을 막는다).
 */
export function isTextRun(el: Element): boolean {
  if (OPAQUE_TAGS.has(el.tagName)) return false;
  if (!el.textContent?.trim()) return false;
  for (const child of el.children) {
    if (!FORMAT_TAGS.has(child.tagName)) return false;
  }
  return true;
}

/** KG 클래스에서 위계를 추론한다. 맞는 것이 없으면 null. */
export function roleOf(el: Element): Role | null {
  for (const [selector, role] of ROLE_SELECTORS) {
    if (el.matches(selector)) return role;
  }
  return null;
}

/**
 * 루트 이하 전체에 ID와 위계를 찍는다.
 * 텍스트 런과 그래픽 요소 내부로는 내려가지 않는다 — 내부 마크업은 편집 단위가 아니다.
 *
 * @param base 시작 경로. 원본은 'n', 추가 노드는 그 노드의 id.
 */
export function stampIds(root: HTMLElement, base = 'n'): void {
  const walk = (el: Element, path: string): void => {
    el.setAttribute(ID_ATTR, path);
    if (el instanceof HTMLElement && el.getAttribute('style')) {
      el.setAttribute(STYLE0_ATTR, el.getAttribute('style')!);
    }
    const role = roleOf(el);
    if (role) el.setAttribute(ROLE_ATTR, role);

    if (OPAQUE_TAGS.has(el.tagName)) return;
    if (isTextRun(el)) {
      el.setAttribute(TEXT_ATTR, '');
      return;
    }
    let i = 0;
    for (const child of el.children) walk(child, `${path}.${i++}`);
  };
  walk(root, base);
}

/** ID로 요소 찾기. 없으면 null. */
export function byId(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${ID_ATTR}="${CSS.escape(id)}"]`);
}

/** 요소의 ID. 찍히지 않았으면 null. */
export function idOf(el: Element | null): string | null {
  return el?.getAttribute(ID_ATTR) ?? null;
}

/** 클릭 지점에서 가장 가까운, ID가 찍힌 요소. 빈 자리(placeholder)는 건너뛴다. */
export function closestNode(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  if (target.closest(`.${SLOT_CLASS}`)) return null;
  return target.closest<HTMLElement>(`[${ID_ATTR}]`);
}

/**
 * 내보내기 직전 편집용 흔적을 지운다.
 * data-kg-role 은 남긴다 — 위계 전역값 CSS가 그것을 보고 걸리므로, 내보낸 파일에서도
 * 같은 위계 규칙이 그대로 유지된다.
 */
export function stripEditorAttrs(root: HTMLElement): void {
  for (const slot of root.querySelectorAll(`.${SLOT_CLASS}`)) slot.remove();
  const clear = (el: Element) => {
    el.removeAttribute(ID_ATTR);
    el.removeAttribute(STYLE0_ATTR);
    el.removeAttribute(TEXT_ATTR);
  };
  for (const el of root.querySelectorAll(`[${ID_ATTR}]`)) clear(el);
  clear(root);
}
