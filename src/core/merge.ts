/**
 * 오버레이 이관 — 원본이 바뀌어도 사람이 쌓은 편집분을 잇는다.
 *
 * `.kgslide` 한 파일에 주인이 둘이다. 작도(명령줄)는 `source` 를, 사람(편집기)은 오버레이를 쓴다.
 * 통째로 덮으면 나중에 쓴 쪽이 이겨 상대의 작업이 사라진다. 그래서 각자 자기 필드만 바꾼다.
 *
 *   source · canvas   작도
 *   patches · tree · theme · stack · blind   사람
 *
 * 다만 오버레이는 원본의 구조 경로(`n.0.1`)로 노드를 가리킨다. 원본이 바뀌면 같은 경로가
 * 다른 요소를 가리킬 수 있으므로 그대로 옮기면 엉뚱한 곳에 서식이 붙는다.
 * 지워지는 것보다 알아채기 어렵다. 그래서 노드마다 확인하고, 옮기지 못한 것은 반드시 보고한다.
 */
import type { NodeId, SlideDoc } from '@contract/index';
import { ID_ATTR, stampIds } from './ids';

export interface CarryReport {
  /** 옮긴 노드 수 */
  carried: number;
  /** 옮기지 못한 노드와 까닭 */
  dropped: { id: NodeId; why: '경로 사라짐' | '다른 요소' }[];
  /** 옮기지 못한 블라인드 자국. 조용히 사라지면 사본에 그대로 나간다. */
  blindDropped: NodeId[];
}

/** 같은 자리인지 — 태그와 클래스가 같아야 같은 요소로 본다. */
function sameShape(a: Element, b: Element): boolean {
  if (a.tagName !== b.tagName) return false;
  return a.getAttribute('class') === b.getAttribute('class');
}

/** 문서의 원본 HTML 을 id 가 찍힌 DOM 으로 편다. */
function stamped(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  const root = host.firstElementChild as HTMLElement | null;
  if (root) stampIds(root);
  return (root ?? host);
}

/**
 * 새 원본 위에 옛 오버레이를 얹는다.
 *
 * @param prev 디스크에 있던 문서(사람의 편집분을 갖고 있다)
 * @param next 새로 그린 문서(원본이 최신이다)
 */
export function carryOverlay(prev: SlideDoc, next: SlideDoc): { doc: SlideDoc; report: CarryReport } {
  const before = stamped(prev.source.html);
  const after = stamped(next.source.html);
  const report: CarryReport = { carried: 0, dropped: [], blindDropped: [] };

  const at = (root: HTMLElement, id: NodeId): Element | null =>
    id === 'n' ? root : root.querySelector(`[${ID_ATTR}="${CSS.escape(id)}"]`);

  /**
   * 이 노드가 새 원본에서도 같은 것인가.
   * 추가 노드(a…)와 도형 슬롯은 원본 경로와 무관하므로 따지지 않는다.
   */
  const survives = (id: NodeId): boolean => {
    if (!id.startsWith('n')) return true;
    const oldEl = at(before, id);
    const newEl = at(after, id);
    if (!newEl) { report.dropped.push({ id, why: '경로 사라짐' }); return false; }
    if (oldEl && !sameShape(oldEl, newEl)) { report.dropped.push({ id, why: '다른 요소' }); return false; }
    report.carried++;
    return true;
  };

  const patches: SlideDoc['patches'] = {};
  for (const [id, patch] of Object.entries(prev.patches)) {
    if (survives(id)) patches[id] = patch;
  }

  /*
   * 블라인드는 따로 센다.
   *
   * survives() 는 옮긴 것·못 옮긴 것을 보고문에 세는데, 서식과 같은 통에 넣으면
   * "편집분 12건" 안에 블라인드가 묻힌다. 가리기로 한 자리를 옮기지 못했다는 말은
   * 서식 하나를 놓쳤다는 말과 무게가 다르다 — 모르고 사본을 내면 그대로 나간다.
   * 그래서 판정만 같은 규칙을 쓰고 보고는 갈라 놓는다.
   */
  const blindMarks: SlideDoc['blind']['marks'] = {};
  for (const [id, mark] of Object.entries(prev.blind?.marks ?? {})) {
    if (!id.startsWith('n') || at(after, id)) blindMarks[id] = mark;
    else report.blindDropped.push(id);
  }

  const removed = prev.tree.removed.filter((id) => survives(id));
  const locked = prev.tree.locked.filter((id) => !id.startsWith('n') || at(after, id));
  const kept = new Set([...Object.keys(patches), ...removed, ...Object.keys(prev.tree.added)]);

  // 묶음은 구성원이 다 남았을 때만 뜻이 있다. 반쪽이 된 묶음은 사람을 헷갈리게 한다.
  const groups: SlideDoc['tree']['groups'] = {};
  for (const [gid, group] of Object.entries(prev.tree.groups)) {
    if (group.members.every((id) => !id.startsWith('n') || at(after, id))) groups[gid] = group;
  }

  return {
    doc: {
      ...next,
      patches,
      tree: { removed, added: prev.tree.added, groups, locked },
      // 위계 전역값은 role 기준이라 원본 구조와 무관하다. 언제나 옮긴다.
      theme: prev.theme,
      stack: prev.stack.filter((id) => kept.has(id) || !id.startsWith('n')),
      blind: { marks: blindMarks },
      createdAt: prev.createdAt,
    },
    report,
  };
}

/**
 * 저장 직전 병합 — 어느 저장소든 여기를 지난다.
 *
 * 메모리의 원본은 장표를 연 시점의 것이다. 그 사이 명령줄이 새로 그렸다면 그대로 쓰면 덮어 버린다.
 * 그래서 디스크의 원본을 가져다 붙이고, 내 오버레이는 경로가 아직 맞는지 확인한 뒤 얹는다.
 *
 * 적재 쪽(carryOverlay)과 같은 규칙이다. 저장과 적재가 다른 규칙을 쓰면
 * 어느 쪽을 지났느냐에 따라 결과가 달라진다.
 *
 * @param memory 편집기가 들고 있는 문서
 * @param disk   지금 저장소에 있는 문서. 없으면 첫 저장이다.
 */
export function mergeForSave(
  memory: SlideDoc,
  disk: SlideDoc | null,
): { doc: SlideDoc; report: CarryReport | null } {
  if (!disk || disk.source.html === memory.source.html) return { doc: memory, report: null };
  const rebased: SlideDoc = { ...memory, source: disk.source, canvas: disk.canvas };
  const { doc, report } = carryOverlay(memory, rebased);
  return { doc: { ...doc, updatedAt: memory.updatedAt }, report };
}

/** 보고문. 조용히 버리지 않기 위한 것이다. */
export function formatCarry(report: CarryReport): string {
  // 블라인드는 앞세운다. 못 옮긴 것이 있으면 사본에 그대로 나가므로 먼저 봐야 한다.
  const blind = report.blindDropped.length
    ? ` ⚠ 가리기로 한 자리 ${report.blindDropped.length}곳을 옮기지 못했습니다 — 사본을 내기 전에 다시 칠하세요`
    : '';

  if (report.dropped.length === 0) return `편집분 ${report.carried}건을 그대로 이었습니다${blind}`;
  const by = report.dropped.reduce<Record<string, number>>((acc, d) => {
    acc[d.why] = (acc[d.why] ?? 0) + 1;
    return acc;
  }, {});
  const detail = Object.entries(by).map(([k, n]) => `${k} ${n}건`).join(' · ');
  return `편집분 ${report.carried}건을 이었고 ${report.dropped.length}건은 옮기지 못했습니다 (${detail})${blind}`;
}
