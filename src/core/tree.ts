/**
 * 구조 오버레이의 불변식 — 여기 한 곳에서만 강제한다.
 *
 * 삭제·추가·그룹은 서로 얽혀 있다. 노드를 지우면 그룹 멤버에서도 빠져야 하고,
 * 쌓임 순서에서도 빠져야 하고, 그룹 멤버가 하나만 남으면 그룹 자체가 의미를 잃는다.
 * 이 정리를 커맨드마다 흩어 두면 반드시 어긋난다. 그래서 apply() 가 끝날 때마다
 * normalize() 를 한 번 통과시키고, 커맨드는 자기 몫만 바꾼다.
 */
import {
  isAdded, isDescendant,
  type GroupId, type NodeId, type SlideDoc,
} from '@contract/index';

/** 지워졌는가 — 자기 자신 또는 조상이 묘비에 있으면 지워진 것이다. */
export function isRemoved(doc: SlideDoc, id: NodeId): boolean {
  return doc.tree.removed.some((r) => isDescendant(id, r));
}

/** 잠겼는가 — 자기 자신 또는 조상이 잠겨 있으면 잠긴 것이다. */
export function isLocked(doc: SlideDoc, id: NodeId): boolean {
  return doc.tree.locked.some((l) => isDescendant(id, l));
}

/** 이 노드가 속한 그룹. 없으면 null. */
export function groupOf(doc: SlideDoc, id: NodeId): GroupId | null {
  for (const [gid, g] of Object.entries(doc.tree.groups)) {
    if (g.members.includes(id)) return gid;
  }
  return null;
}

/** 선택을 그룹 단위로 넓힌다. 그룹 안 하나를 고르면 전부 고른 것으로 본다. */
export function expandSelection(doc: SlideDoc, ids: NodeId[]): NodeId[] {
  const out = new Set<NodeId>();
  for (const id of ids) {
    const gid = groupOf(doc, id);
    if (gid) doc.tree.groups[gid]!.members.forEach((m) => out.add(m));
    else out.add(id);
  }
  return [...out];
}

/** 이동·삭제가 가능한 대상만 남긴다. 잠긴 것과 이미 지워진 것을 걷어낸다. */
export function editable(doc: SlideDoc, ids: NodeId[]): NodeId[] {
  return ids.filter((id) => !isLocked(doc, id) && !isRemoved(doc, id));
}

/**
 * 불변식 강제.
 *  1. 묘비는 중복·하위중복을 없앤다. 추가 노드는 묘비 대신 실제로 지운다.
 *  2. 추가 노드는 항상 떼어낸 상태이고 항상 쌓임 순서에 들어 있다.
 *  3. 쌓임 순서에는 살아 있는 떼어낸 노드와 추가 노드만 남는다.
 *  4. 그룹 멤버는 살아 있는 것만. 둘 미만이면 그룹을 없앤다.
 *  5. 하드 삭제된 추가 노드의 patches 는 함께 지운다.
 *     (원본 노드의 patches 는 남긴다 — 되살리면 서식까지 돌아와야 하므로)
 */
export function normalize(doc: SlideDoc): SlideDoc {
  const added = { ...doc.tree.added };

  // 1. 묘비 정리
  const removed: NodeId[] = [];
  for (const id of [...new Set(doc.tree.removed)]) {
    if (isAdded(id)) {
      delete added[id];
      continue;
    }
    if (removed.some((r) => isDescendant(id, r))) continue;
    removed.push(id);
  }
  // 조상이 새로 들어오면서 하위가 된 것들 제거
  const prunedRemoved = removed.filter((id) => !removed.some((r) => r !== id && isDescendant(id, r)));

  const alive = (id: NodeId) =>
    (isAdded(id) ? id.split('.')[0]! in added : true) &&
    !prunedRemoved.some((r) => isDescendant(id, r));

  // 2. 추가 노드는 항상 떼어낸 상태
  const patches = { ...doc.patches };
  for (const id of Object.keys(patches)) {
    if (isAdded(id) && !alive(id)) delete patches[id];
  }
  for (const id of Object.keys(added)) {
    const p = patches[id] ?? {};
    if (p.layout?.mode !== 'detached') {
      const { mode: _drop, ...rest } = p.layout ?? {};
      patches[id] = { ...p, layout: { x: 0, y: 0, w: 240, h: 80, ...rest, mode: 'detached' } };
    }
  }

  // 3. 쌓임 순서
  const stack = [...new Set(doc.stack)].filter(
    (id) => alive(id) && (id in added || patches[id]?.layout?.mode === 'detached'),
  );
  for (const id of Object.keys(added)) if (!stack.includes(id)) stack.push(id);

  // 4. 그룹
  const groups: SlideDoc['tree']['groups'] = {};
  for (const [gid, g] of Object.entries(doc.tree.groups)) {
    const members = g.members.filter(alive);
    if (members.length >= 2) groups[gid] = { ...g, members };
  }

  return {
    ...doc,
    patches,
    stack,
    tree: { ...doc.tree, removed: prunedRemoved, added, groups },
  };
}
