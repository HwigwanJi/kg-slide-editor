/**
 * 노드 식별 — 원본 HTML에 안정 ID와 위계를 찍는다.
 *
 * ID는 DOM 구조 경로다(`n.2.0.1`). 원본이 바뀌지 않는 한 같은 요소는 항상 같은 ID를 얻는다.
 * 저장 문서는 이 ID로만 요소를 가리키므로, 원본 HTML을 다시 파싱해도 패치가 그대로 붙는다.
 *
 * 위계는 글자가 있는 요소 전부에 반드시 붙는다. "지정 없음"은 만들지 않는다.
 * 붙는 순서는 (1) 장표가 직접 붙인 값 → (2) KG 클래스 매칭 → (3) 구조 추론 → (4) 본문 1단.
 * 추론은 완벽하지 않다. 그래서 속성 패널에서 사람이 바꿀 수 있고, 그 값이 이긴다.
 */
import { NUMERIC_LABEL, ROLE_ATTR, ROLE_SELECTORS, bodyRole, type Role } from '@contract/index';

export const ID_ATTR = 'data-kg-id';
/** 계약이 정한 위계 속성 이름. 코어 밖(검사 도구 등)에서도 같은 이름을 봐야 한다. */
export const ROLE_ATTR_PUBLIC = ROLE_ATTR;
/** 원본 style 속성 백업. 재렌더를 원본 기준에서 다시 시작하기 위한 것. */
export const STYLE0_ATTR = 'data-kg-style0';
/** 텍스트 편집 가능 표시 */
export const TEXT_ATTR = 'data-kg-text';
/** 말머리표 — 값이 있으면 그 기호를, 'off' 면 위계 전역값까지 끈다. */
export const MARKER_ATTR = 'data-kg-marker';
export const MARKER_OFF_ATTR = 'data-kg-marker-off';
/** 떼어낸 자리에 남는 빈 자리 표시 */
export const SLOT_CLASS = 'kg-slot';
/**
 * 자동으로 채워지는 자리. 값은 장표가 아니라 덱이 안다(쪽번호 등).
 * 사람이 손으로 고칠 값이 아니므로 글자 편집 단위로 열지 않는다.
 */
export const AUTO_ATTR = 'data-kg-auto';
/**
 * 도형 안에서 글자를 갈아 끼울 수 있는 자리.
 * SVG 는 통째로 불투명하게 다루되, 이 표시가 붙은 요소만 편집 단위로 연다.
 * 전부 열면 좌표·경로까지 편집 단위가 되어 위계와 검사가 무너진다(docs/SVG.md).
 */
export const SLOT_ATTR = 'data-slot';

/** 이 태그들만 텍스트 내부 서식으로 인정한다. tiptap 인라인 스키마와 같은 집합이어야 한다. */
export const FORMAT_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR']);

/**
 * 내부로 내려가지 않는 태그. 도형·그래픽은 통째로 하나의 요소로 다룬다.
 *
 * SVG 요소의 tagName 은 소문자다(HTML 요소만 대문자). 대문자로만 비교하면
 * svg 안으로 내려가 <text> 하나하나가 편집 단위가 되고, 검사도 그것들을 글자로 잡는다.
 * 그래서 반드시 대소문자를 맞춰 비교한다.
 */
const OPAQUE_TAGS = new Set(['SVG', 'CANVAS', 'IMG', 'VIDEO', 'IFRAME']);
const isOpaque = (el: Element): boolean => OPAQUE_TAGS.has(el.tagName.toUpperCase());

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
  if (isOpaque(el)) return false;
  // 자동으로 채워지는 자리는 고칠 대상이 아니다.
  if (el.hasAttribute(AUTO_ATTR)) return false;
  if (!el.textContent?.trim()) return false;
  for (const child of el.children) {
    if (!FORMAT_TAGS.has(child.tagName)) return false;
  }
  return !isMixedFormat(el);
}

/**
 * 한 상자 안에 서식이 다른 덩어리가 나란히 있는가.
 *
 * 예: `<div class="cell"><b>핵심사업</b><em>수혜가치</em></div>`
 * 둘 다 서식 태그라 겉보기에는 글자 한 덩어리지만, 크기와 색이 서로 다르다.
 * 이것을 한 덩어리로 다루면 위계가 하나만 붙고 각각을 따로 고칠 수 없다.
 *
 * 판정 기준은 "덩어리로 나뉘어 있는가"다.
 *  - 글자가 서식 태그 안에만 있고(느슨한 글자 없음)
 *  - 그중 서로 크기나 색이 다른 것이 있으면
 * 나뉜 것으로 보고 각각을 따로 다룬다.
 *
 * 문장 속 강조(`제작비 <b>세액공제</b> 적용`)는 느슨한 글자가 함께 있으므로 여기 걸리지 않는다.
 * 그건 한 문장이 맞고, 나누면 오히려 편집이 불편해진다.
 */
export function isMixedFormat(el: Element): boolean {
  const marked = [...el.children].filter((c) => c.tagName !== 'BR');
  if (marked.length < 2) return false;

  // 서식 태그 밖에 느슨한 글자가 있으면 한 문장이다.
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return false;
  }

  const seen = marked.map((c) => {
    const cs = getComputedStyle(c);
    return `${cs.fontSize}|${cs.color}|${cs.fontWeight}`;
  });
  return new Set(seen).size > 1;
}

/** KG 클래스에서 위계를 찾는다. 맞는 것이 없으면 null. */
export function matchRole(el: Element): Role | null {
  for (const [selector, role] of ROLE_SELECTORS) {
    if (el.matches(selector)) return role;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 위계 추론                                                            */
/* ------------------------------------------------------------------ */

type Area = 'header' | 'message' | 'body' | 'footer';

interface WalkCtx {
  area: Area;
  /** 중첩된 목록의 깊이. 목록 항목은 이 깊이로 본문 단계를 정한다. */
  listDepth: number;
  /** 형제 텍스트 런 가운데 몇 번째인가. 위계가 이미 정해진 형제는 세지 않는다. */
  runIndex: number;
  /** 위계가 정해지지 않은 형제 텍스트 런의 수 */
  runCount: number;
  /** 부모가 이미 본문 계열이면 한 단 아래로 내려간다. */
  bodyLevel: number;
}

const AREAS: [string, Area][] = [
  ['.kg-header', 'header'],
  ['.kg-msgband', 'message'],
  ['.kg-footer', 'footer'],
  ['.kg-body-area', 'body'],
];

function areaOf(el: Element, inherited: Area): Area {
  for (const [selector, area] of AREAS) if (el.matches(selector)) return area;
  return inherited;
}

/**
 * 위계 판정 — 장표 전체를 한 번 재고 나서 상대적으로 정한다.
 *
 * 절대 크기로 자르면 장표마다 기준이 달라 맞지 않는다(어떤 장표는 본문이 17px, 어떤 장표는 14px).
 * 그래서 이 장표 안의 본문 크기 분포를 먼저 구하고, 그것을 기준으로 삼는다.
 *
 *  - 굵고 본문보다 크거나 같음 → 소제목(h3)
 *  - 굵지만 본문보다 작음      → 칩·태그(label). 셰브론·배지가 여기 들어온다.
 *  - 굵지 않음                 → 본문. 서로 다른 크기를 큰 것부터 줄 세워 1~4단으로 나눈다.
 *
 * 계산된 서식을 읽으므로 호출 쪽(editor.draw)에서 전역 위계 CSS를 잠시 꺼 둔다.
 * 그러지 않으면 "굵게 바꿨더니 위계가 바뀌고 다시 굵어지는" 순환이 생긴다.
 */
interface Measured {
  el: Element;
  ctx: WalkCtx;
  size: number;
  weight: number;
}

function assignRoles(runs: { el: Element; ctx: WalkCtx }[]): void {
  const measured: Measured[] = runs.map(({ el, ctx }) => {
    const cs = getComputedStyle(el);
    return { el, ctx, size: round(parseFloat(cs.fontSize)), weight: Number(cs.fontWeight) || 400 };
  });

  const body = measured.filter((m) => m.ctx.area === 'body');
  const plain = body.filter((m) => m.weight < 600).map((m) => m.size);
  const baseline = median(plain.length ? plain : body.map((m) => m.size)) ?? 16;
  const ladder = [...new Set(plain)].sort((a, b) => b - a);

  for (const m of measured) {
    m.el.setAttribute(ROLE_ATTR, roleFor(m, baseline, ladder));
  }
}

function roleFor(m: Measured, baseline: number, ladder: number[]): Role {
  const text = (m.el.textContent ?? '').trim();

  // 번호처럼 보이는 짧은 표기는 어디에 있든 번호 라벨이다.
  if (NUMERIC_LABEL.test(text)) return 'num';

  if (m.ctx.area === 'header') return m.size >= baseline ? 'label' : 'label2';
  if (m.ctx.area === 'message') return 'message';
  if (m.ctx.area === 'footer') return 'caption';

  // 목록 항목은 중첩 깊이가 곧 단계다.
  if (m.ctx.listDepth > 0) return bodyRole(m.ctx.listDepth + 1);

  // 굵은 글자 — 본문 이상이면 소제목, 그보다 작으면 태그다.
  // 태그도 크기로 강조·보조를 가른다. 셰브론의 활성/비활성이 여기서 갈린다.
  if (m.weight >= 600) {
    if (m.size >= baseline) return 'h3';
    return m.size >= baseline * 0.85 ? 'label' : 'label2';
  }

  const level = ladder.indexOf(m.size);
  return bodyRole(level < 0 ? 1 : level + 1);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function round(n: number): number {
  return Number.isNaN(n) ? 0 : Math.round(n * 2) / 2;
}

/* ------------------------------------------------------------------ */

/**
 * 루트 이하 전체에 ID와 위계를 찍는다.
 * 텍스트 런과 그래픽 요소 내부로는 내려가지 않는다 — 내부 마크업은 편집 단위가 아니다.
 *
 * @param base 시작 경로. 원본은 'n', 추가 노드는 그 노드의 id.
 */
export function stampIds(root: HTMLElement, base = 'n'): void {
  /** 위계가 명시되지 않은 글자 덩어리. 전부 모은 뒤 한꺼번에 판정한다. */
  const unassigned: { el: Element; ctx: WalkCtx }[] = [];

  const walk = (el: Element, path: string, ctx: WalkCtx): void => {
    el.setAttribute(ID_ATTR, path);
    if (el instanceof HTMLElement && el.getAttribute('style')) {
      el.setAttribute(STYLE0_ATTR, el.getAttribute('style')!);
    }

    const area = areaOf(el, ctx.area);
    const explicit = el.getAttribute(ROLE_ATTR) as Role | null;
    const matched = explicit ?? matchRole(el);

    if (isOpaque(el)) {
      stampSlots(el, path);
      return;
    }

    if (isTextRun(el)) {
      el.setAttribute(TEXT_ATTR, '');
      if (matched) el.setAttribute(ROLE_ATTR, matched);
      else unassigned.push({ el, ctx: { ...ctx, area } });
      return;
    }

    // 글자 없는 묶음에도 매칭된 위계는 남긴다(박스 제목바처럼 자식을 가진 경우).
    if (matched) el.setAttribute(ROLE_ATTR, matched);

    const children = [...el.children];
    const freeRuns = children.filter((c) => isTextRun(c) && !c.getAttribute(ROLE_ATTR) && !matchRole(c));
    const listDepth = ctx.listDepth + (el.tagName === 'UL' || el.tagName === 'OL' ? 1 : 0);
    const bodyLevel = matched && matched.startsWith('body')
      ? Number(matched.slice(4)) + 1
      : ctx.bodyLevel;

    children.forEach((child, i) => {
      walk(child, `${path}.${i}`, {
        area,
        listDepth,
        runIndex: freeRuns.indexOf(child),
        runCount: freeRuns.length,
        bodyLevel,
      });
    });
  };

  walk(root, base, { area: 'body', listDepth: 0, runIndex: 0, runCount: 0, bodyLevel: 1 });
  assignRoles(unassigned);

  /**
   * 도형 안의 슬롯에 id 를 준다.
   * 문서 순서로 번호를 매기므로 같은 도형이면 언제 그려도 같은 id 가 나온다.
   * 위계(role)는 붙이지 않는다 — SVG 글자는 KG 위계 CSS 의 사정권 밖이다.
   */
  function stampSlots(host: Element, path: string): void {
    let i = 0;
    for (const slot of host.querySelectorAll(`[${SLOT_ATTR}]`)) {
      slot.setAttribute(ID_ATTR, `${path}.s${i++}`);
      slot.setAttribute(TEXT_ATTR, '');
    }
  }
}

/** ID로 요소 찾기. 없으면 null. */
export function byId(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${ID_ATTR}="${CSS.escape(id)}"]`);
}

/** 요소의 ID. 찍히지 않았으면 null. */
export function idOf(el: Element | null): string | null {
  return el?.getAttribute(ID_ATTR) ?? null;
}

/** 요소의 위계. 스탬핑을 거쳤다면 반드시 값이 있다. */
export function roleOf(el: Element | null): Role | null {
  return (el?.getAttribute(ROLE_ATTR) as Role | null) ?? null;
}

/** 클릭 지점에서 가장 가까운, ID가 찍힌 요소. 빈 자리(placeholder)는 건너뛴다. */
export function closestNode(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  if (target.closest(`.${SLOT_CLASS}`)) return null;
  return target.closest<HTMLElement>(`[${ID_ATTR}]`);
}

/**
 * 내보내기 직전 편집용 흔적을 지운다.
 * data-kg-role 과 말머리표 표시는 남긴다 — 위계 CSS 가 그것을 보고 걸리므로,
 * 내보낸 파일에서도 같은 위계 규칙이 그대로 유지된다.
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
