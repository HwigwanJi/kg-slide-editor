/**
 * 선택 참조 — 사람이 채팅창에 붙여 넣어 "이 부분"을 가리키는 쪽지.
 *
 * 지금까지는 사람이 "왼쪽 두 번째 박스 아래 작은 글씨" 같은 말로 설명해야 했고,
 * AI 는 그게 어느 요소인지 추측해야 했다. 추측이 빗나가면 엉뚱한 곳이 고쳐진다.
 * 이 쪽지 하나면 어느 프로젝트·어느 장표·어느 노드인지가 확정된다.
 *
 * 형식은 두 몫을 한다.
 *  - 기계가 읽는 줄(slide / nodes) — 그대로 tools/apply.mjs 에 넣을 수 있다.
 *  - 사람이 읽는 줄(위계와 글자) — 붙여 넣기 전에 맞게 골랐는지 눈으로 확인한다.
 *
 * 여러 개를 골랐을 때의 규칙
 *  1. 클릭한 순서가 아니라 장표 안 순서로 늘어놓는다. 같은 선택이면 항상 같은 쪽지가 나온다.
 *  2. 부모와 그 하위를 함께 골랐으면 부모만 적는다. 하위는 "하위 포함"으로 줄인다.
 *  3. 미리보기는 8줄까지만. 나머지는 개수로 줄인다. 쪽지가 길면 붙여 넣지 않게 된다.
 */
import { ROLE_TOKENS, type NodeId, type Role, type SlideDoc } from '@contract/index';
import { ID_ATTR, roleOf } from './ids';
import { groupOf } from './tree';

const PREVIEW_LIMIT = 8;

export interface ReferenceInput {
  doc: SlideDoc;
  projectName: string;
  ids: NodeId[];
  /** 렌더된 .kg-slide. 위계와 글자를 여기서 읽는다. */
  root: HTMLElement | null;
}

/** 부모가 함께 선택되었으면 하위는 뺀다. */
export function collapseSelection(ids: NodeId[]): { kept: NodeId[]; folded: number } {
  const kept = ids.filter((id) => !ids.some((other) => other !== id && id.startsWith(`${other}.`)));
  return { kept, folded: ids.length - kept.length };
}

/** 장표 안 순서. DOM 순서를 쓸 수 있으면 그것을, 없으면 경로 순으로. */
function inDocumentOrder(ids: NodeId[], root: HTMLElement | null): NodeId[] {
  if (!root) return [...ids].sort(comparePath);
  const order = new Map<string, number>();
  [...root.querySelectorAll(`[${ID_ATTR}]`)].forEach((el, i) => {
    order.set(el.getAttribute(ID_ATTR)!, i);
  });
  return [...ids].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || comparePath(a, b));
}

function comparePath(a: NodeId, b: NodeId): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = Number(pa[i] ?? -1) - Number(pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

export function buildReference({ doc, projectName, ids, root }: ReferenceInput): string {
  if (ids.length === 0) return '';

  const { kept, folded } = collapseSelection(ids);
  const ordered = inDocumentOrder(kept, root);
  const title = doc.title || '제목 없음';

  const lines = [
    `@kg 장표 "${title}" (${projectName})`,
    `   slide: ${doc.id}`,
    `   nodes: ${ordered.join(', ')}`,
  ];

  const groups = new Set(ordered.map((id) => groupOf(doc, id)).filter(Boolean));
  const notes: string[] = [];
  if (folded > 0) notes.push(`하위 ${folded}개 포함`);
  if (groups.size > 0) notes.push(`그룹 ${groups.size}개`);
  if (notes.length) lines.push(`   note: ${notes.join(' · ')}`);

  lines.push('   ── 고른 것 ──');
  for (const id of ordered.slice(0, PREVIEW_LIMIT)) {
    const el = root?.querySelector<HTMLElement>(`[${ID_ATTR}="${CSS.escape(id)}"]`) ?? null;
    lines.push(`   [${label(roleOf(el), el)}] ${describe(el)}`);
  }
  if (ordered.length > PREVIEW_LIMIT) {
    lines.push(`   … 그 외 ${ordered.length - PREVIEW_LIMIT}개`);
  }

  return lines.join('\n');
}

/** 위계가 없는 것은 묶음이거나 도형이다. 글자를 품고 있으면 묶음으로 본다. */
function label(role: Role | null, el: HTMLElement | null): string {
  if (role) return ROLE_TOKENS[role].label;
  return el && (el.textContent ?? '').trim() ? '묶음' : '도형';
}

function describe(el: HTMLElement | null): string {
  if (!el) return '(화면에서 찾지 못함)';
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  const cls = el.classList[0];
  return cls ? `.${cls} (글자 없음)` : `${el.tagName.toLowerCase()} (글자 없음)`;
}
