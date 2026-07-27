/**
 * 커맨드 — 문서를 바꾸는 유일한 통로.
 *
 * apply()는 순수 함수다. 시각·DOM·시간·난수에 의존하지 않는다.
 * 새 식별자와 좌표처럼 바깥 세계가 필요한 값은 액션 계층(app/editor.ts)이 만들어 넣는다.
 * 마지막에 normalize()를 한 번 통과시켜 구조 불변식을 강제한다 — 각 커맨드는 자기 몫만 바꾼다.
 *
 * 여기 추가한 커맨드는 반드시 app/actions.ts 에도 등록해야 한다.
 * (등록하지 않으면 UI에 노출되지 않는 기능이 생긴다. 세션 훅이 이를 점검한다)
 */
import type {
  AddedNode, Anchor, Distribute, GroupId, NodeId, ObjectAlign, Role, RoleStyle,
  SlideDoc, StylePatch,
} from '@contract/index';
import { ANCHOR_ORIGIN, isAdded } from '@contract/index';
import { normalize } from './tree';
import { createStore, type Store } from './store';

export interface Rect { x: number; y: number; w: number; h: number }

export type SlideStore = Store<SlideDoc, Command>;

export function createSlideStore(
  doc: SlideDoc,
  now: () => string = () => new Date().toISOString(),
): SlideStore {
  return createStore(doc, apply, (d) => ({ ...d, updatedAt: now() }));
}

export type Command =
  /* 문서 */
  | { type: 'setTitle'; title: string }
  /* 글자·서식 */
  | { type: 'setText'; id: NodeId; html: string }
  | { type: 'setStyle'; ids: NodeId[]; style: StylePatch }
  | { type: 'applyFormat'; ids: NodeId[]; style: StylePatch }
  | { type: 'clearStyle'; ids: NodeId[]; keys?: (keyof StylePatch)[] }
  | { type: 'setHidden'; ids: NodeId[]; hidden: boolean }
  /** 위계 수동 지정. null 이면 자동 추론으로 되돌린다. */
  | { type: 'setRole'; ids: NodeId[]; role: Role | null }
  /* 배치 */
  | { type: 'detach'; id: NodeId; rect: Rect }
  | { type: 'reflow'; ids: NodeId[] }
  | { type: 'nudge'; ids: NodeId[]; dx: number; dy: number }
  | { type: 'setRect'; id: NodeId; rect: Partial<Rect> }
  /** 고정점을 붙박아 둔 채 확대·축소 */
  | { type: 'scaleObject'; ids: NodeId[]; factor: number; anchor: Anchor }
  | { type: 'alignObjects'; ids: NodeId[]; edge: ObjectAlign }
  | { type: 'distribute'; ids: NodeId[]; axis: Distribute }
  | { type: 'order'; ids: NodeId[]; op: 'front' | 'back' | 'forward' | 'backward' }
  /* 존재 */
  | { type: 'remove'; ids: NodeId[] }
  | { type: 'restore'; ids: NodeId[] }
  | { type: 'insert'; id: NodeId; node: AddedNode; rect: Rect }
  | { type: 'group'; groupId: GroupId; ids: NodeId[]; label?: string }
  | { type: 'ungroup'; groupIds: GroupId[] }
  | { type: 'setLocked'; ids: NodeId[]; locked: boolean }
  /* 위계 전역값 */
  | { type: 'setRoleStyle'; role: Role; style: RoleStyle | null }
  | { type: 'setThemeScale'; scale: number }
  | { type: 'resetTheme' };

export function apply(doc: SlideDoc, cmd: Command): SlideDoc {
  return normalize(reduce(doc, cmd));
}

function reduce(doc: SlideDoc, cmd: Command): SlideDoc {
  switch (cmd.type) {
    case 'setTitle':
      return { ...doc, title: cmd.title };

    case 'setText':
      return patch(doc, cmd.id, (p) => ({ ...p, text: { html: cmd.html } }));

    case 'setStyle':
      return patchMany(doc, cmd.ids, (p) => ({ ...p, style: prune({ ...p.style, ...cmd.style }) }));

    /** 서식 붙여넣기 — 합치지 않고 통째로 갈아 끼운다. 원본 서식이 섞여 남는 것을 막는다. */
    case 'applyFormat':
      return patchMany(doc, cmd.ids, (p) => ({ ...p, style: prune(cmd.style) }));

    case 'clearStyle':
      return patchMany(doc, cmd.ids, (p) => {
        if (!cmd.keys) return omit(p, 'style');
        const next = { ...p.style };
        for (const k of cmd.keys) delete next[k];
        return Object.keys(next).length ? { ...p, style: next } : omit(p, 'style');
      });

    case 'setHidden':
      return patchMany(doc, cmd.ids, (p) => (cmd.hidden ? { ...p, hidden: true } : omit(p, 'hidden')));

    case 'setRole':
      return patchMany(doc, cmd.ids, (p) => (cmd.role ? { ...p, role: cmd.role } : omit(p, 'role')));

    case 'detach': {
      const next = patch(doc, cmd.id, (p) => ({
        ...p,
        layout: { mode: 'detached', keepSlot: true, ...cmd.rect },
      }));
      return next.stack.includes(cmd.id) ? next : { ...next, stack: [...next.stack, cmd.id] };
    }

    case 'reflow': {
      // 추가 노드는 흐름으로 돌아갈 자리가 없다(원본에 없으므로). 원본 노드만 되돌린다.
      const targets = cmd.ids.filter((id) => !isAdded(id));
      const next = patchMany(doc, targets, (p) => omit(p, 'layout'));
      return { ...next, stack: next.stack.filter((s) => !targets.includes(s)) };
    }

    case 'nudge':
      return patchMany(doc, cmd.ids, (p) => {
        const l = p.layout;
        if (l?.mode === 'detached') {
          return { ...p, layout: { ...l, x: (l.x ?? 0) + cmd.dx, y: (l.y ?? 0) + cmd.dy } };
        }
        return {
          ...p,
          layout: { mode: 'flow', dx: (l?.dx ?? 0) + cmd.dx, dy: (l?.dy ?? 0) + cmd.dy },
        };
      });

    case 'setRect':
      return patch(doc, cmd.id, (p) => {
        if (p.layout?.mode !== 'detached') return p;
        return { ...p, layout: { ...p.layout, ...cmd.rect } };
      });

    case 'scaleObject': {
      const boxes = boxesOf(doc, cmd.ids);
      if (boxes.length === 0) return doc;
      const [ox, oy] = ANCHOR_ORIGIN[cmd.anchor];
      return writeBoxes(doc, boxes.map((b) => {
        const w = Math.max(8, Math.round(b.w * cmd.factor));
        const h = Math.max(8, Math.round(b.h * cmd.factor));
        // 고정점의 절대 좌표가 변하지 않도록 좌상단을 되민다.
        return { ...b, w, h, x: Math.round(b.x + (b.w - w) * ox), y: Math.round(b.y + (b.h - h) * oy) };
      }));
    }

    case 'alignObjects':
      return alignObjects(doc, cmd.ids, cmd.edge);

    case 'distribute':
      return distribute(doc, cmd.ids, cmd.axis);

    case 'order':
      return reorder(doc, cmd.ids, cmd.op);

    /** 원본 노드는 묘비를, 추가 노드는 실제 삭제를 남긴다. 구분은 normalize() 가 처리한다. */
    case 'remove':
      return { ...doc, tree: { ...doc.tree, removed: [...doc.tree.removed, ...cmd.ids] } };

    case 'restore':
      return {
        ...doc,
        tree: { ...doc.tree, removed: doc.tree.removed.filter((r) => !cmd.ids.includes(r)) },
      };

    case 'insert': {
      const next = {
        ...doc,
        tree: { ...doc.tree, added: { ...doc.tree.added, [cmd.id]: cmd.node } },
      };
      return patch(next, cmd.id, (p) => ({
        ...p,
        layout: { mode: 'detached', ...cmd.rect },
      }));
    }

    case 'group': {
      const members = [...new Set(cmd.ids)];
      if (members.length < 2) return doc;
      return {
        ...doc,
        tree: {
          ...doc.tree,
          groups: { ...doc.tree.groups, [cmd.groupId]: { members, label: cmd.label ?? '' } },
        },
      };
    }

    case 'ungroup': {
      const groups = { ...doc.tree.groups };
      for (const gid of cmd.groupIds) delete groups[gid];
      return { ...doc, tree: { ...doc.tree, groups } };
    }

    case 'setLocked': {
      const locked = cmd.locked
        ? [...new Set([...doc.tree.locked, ...cmd.ids])]
        : doc.tree.locked.filter((l) => !cmd.ids.includes(l));
      return { ...doc, tree: { ...doc.tree, locked } };
    }

    case 'setRoleStyle': {
      const roles = { ...doc.theme.roles };
      if (cmd.style === null || Object.keys(cmd.style).length === 0) delete roles[cmd.role];
      else roles[cmd.role] = { ...roles[cmd.role], ...cmd.style };
      return { ...doc, theme: { ...doc.theme, roles } };
    }

    case 'setThemeScale':
      return { ...doc, theme: { ...doc.theme, scale: cmd.scale } };

    case 'resetTheme':
      return { ...doc, theme: { scale: 1, roles: {} } };
  }
}

/* ------------------------------------------------------------------ */

function patch(doc: SlideDoc, id: NodeId, fn: (p: SlideDoc['patches'][string]) => SlideDoc['patches'][string]): SlideDoc {
  const next = fn(doc.patches[id] ?? {});
  const patches = { ...doc.patches };
  if (Object.keys(next).length === 0) delete patches[id];
  else patches[id] = next;
  return { ...doc, patches };
}

function patchMany(doc: SlideDoc, ids: NodeId[], fn: (p: SlideDoc['patches'][string]) => SlideDoc['patches'][string]): SlideDoc {
  return ids.reduce((d, id) => patch(d, id, fn), doc);
}

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const { [key]: _drop, ...rest } = obj;
  return rest;
}

/** undefined 값을 걷어낸다. 계약에 빈 항목이 쌓이지 않게 한다. */
function prune(style: StylePatch): StylePatch {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) if (v !== undefined) out[k] = v;
  return out as StylePatch;
}

type Boxed = { id: NodeId; x: number; y: number; w: number; h: number };

/** 떼어낸 요소만 정렬·배분 대상이다. 흐름 요소의 위치는 KG 레이아웃이 정한다. */
function boxesOf(doc: SlideDoc, ids: NodeId[]): Boxed[] {
  const out: Boxed[] = [];
  for (const id of ids) {
    const l = doc.patches[id]?.layout;
    if (l?.mode !== 'detached') continue;
    if (l.x === undefined || l.y === undefined || l.w === undefined || l.h === undefined) continue;
    out.push({ id, x: l.x, y: l.y, w: l.w, h: l.h });
  }
  return out;
}

function writeBoxes(doc: SlideDoc, boxes: Boxed[]): SlideDoc {
  const patches = { ...doc.patches };
  for (const b of boxes) {
    const prev = patches[b.id];
    if (prev?.layout?.mode !== 'detached') continue;
    patches[b.id] = { ...prev, layout: { ...prev.layout, x: b.x, y: b.y, w: b.w, h: b.h } };
  }
  return { ...doc, patches };
}

function alignObjects(doc: SlideDoc, ids: NodeId[], edge: ObjectAlign): SlideDoc {
  const boxes = boxesOf(doc, ids);
  if (boxes.length < 2) return doc;
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));

  return writeBoxes(doc, boxes.map((b) => {
    switch (edge) {
      case 'left': return { ...b, x: minX };
      case 'right': return { ...b, x: maxX - b.w };
      case 'hcenter': return { ...b, x: Math.round((minX + maxX) / 2 - b.w / 2) };
      case 'top': return { ...b, y: minY };
      case 'bottom': return { ...b, y: maxY - b.h };
      case 'vcenter': return { ...b, y: Math.round((minY + maxY) / 2 - b.h / 2) };
    }
  }));
}

/** 양 끝은 고정하고 사이 간격을 고르게 한다. */
function distribute(doc: SlideDoc, ids: NodeId[], axis: Distribute): SlideDoc {
  const boxes = boxesOf(doc, ids);
  if (boxes.length < 3) return doc;
  const horizontal = axis === 'horizontal';
  const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = horizontal
    ? (last.x + last.w) - first.x - sorted.reduce((s, b) => s + b.w, 0)
    : (last.y + last.h) - first.y - sorted.reduce((s, b) => s + b.h, 0);
  const gap = span / (sorted.length - 1);

  let cursor = horizontal ? first.x : first.y;
  return writeBoxes(doc, sorted.map((b, i) => {
    if (i === 0) {
      cursor += horizontal ? b.w + gap : b.h + gap;
      return b;
    }
    const placed = horizontal ? { ...b, x: Math.round(cursor) } : { ...b, y: Math.round(cursor) };
    cursor += horizontal ? b.w + gap : b.h + gap;
    return placed;
  }));
}

function reorder(doc: SlideDoc, ids: NodeId[], op: 'front' | 'back' | 'forward' | 'backward'): SlideDoc {
  let stack = [...doc.stack];
  const targets = ids.filter((id) => stack.includes(id));
  if (targets.length === 0) return doc;

  if (op === 'front' || op === 'back') {
    const rest = stack.filter((id) => !targets.includes(id));
    stack = op === 'front' ? [...rest, ...targets] : [...targets, ...rest];
    return { ...doc, stack };
  }

  // 한 칸씩. 앞으로 보낼 때는 뒤에서부터, 뒤로 보낼 때는 앞에서부터 움직여야 서로 밀리지 않는다.
  const order = op === 'forward'
    ? [...targets].sort((a, b) => stack.indexOf(b) - stack.indexOf(a))
    : [...targets].sort((a, b) => stack.indexOf(a) - stack.indexOf(b));

  for (const id of order) {
    const i = stack.indexOf(id);
    const to = op === 'forward' ? Math.min(i + 1, stack.length - 1) : Math.max(i - 1, 0);
    if (to === i) continue;
    stack.splice(i, 1);
    stack.splice(to, 0, id);
  }
  return { ...doc, stack };
}
