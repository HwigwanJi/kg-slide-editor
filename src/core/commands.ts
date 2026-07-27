/**
 * 커맨드 — 문서를 바꾸는 유일한 통로.
 *
 * 모든 편집(텍스트·서식·이동·정렬·순서)은 여기 정의된 커맨드 하나로 표현된다.
 * apply()는 순수 함수다. 시각·DOM·시간에 의존하지 않으므로 실행취소와 재현이 공짜로 얻어진다.
 * UI가 늘어나도 이 파일 밖에서 patches 를 직접 건드리면 안 된다.
 */
import type { NodeId, NodePatch, ObjectAlign, SlideDoc, StylePatch } from '@contract/index';

export interface Rect { x: number; y: number; w: number; h: number }

export type Command =
  | { type: 'setTitle'; title: string }
  | { type: 'setText'; id: NodeId; html: string }
  | { type: 'setStyle'; id: NodeId; style: StylePatch }
  | { type: 'clearStyle'; id: NodeId; keys?: (keyof StylePatch)[] }
  | { type: 'setHidden'; id: NodeId; hidden: boolean }
  /** 흐름에서 떼어내 캔버스 절대좌표로 고정 */
  | { type: 'detach'; id: NodeId; rect: Rect }
  /** 다시 흐름 레이아웃으로 되돌림 */
  | { type: 'reflow'; id: NodeId }
  /** 흐름 유지 상태의 미세 이동(주변 재배치 없음) */
  | { type: 'nudge'; id: NodeId; dx: number; dy: number }
  /** detached 요소의 위치·크기 */
  | { type: 'setRect'; id: NodeId; rect: Partial<Rect> }
  /** detached 요소 정렬 */
  | { type: 'alignObjects'; ids: NodeId[]; edge: ObjectAlign }
  /** 쌓임 순서 */
  | { type: 'order'; id: NodeId; op: 'front' | 'back' | 'forward' | 'backward' };

export function apply(doc: SlideDoc, cmd: Command): SlideDoc {
  switch (cmd.type) {
    case 'setTitle':
      return { ...doc, title: cmd.title };

    case 'setText':
      return patch(doc, cmd.id, (p) => ({ ...p, text: { html: cmd.html } }));

    case 'setStyle':
      return patch(doc, cmd.id, (p) => ({ ...p, style: prune({ ...p.style, ...cmd.style }) }));

    case 'clearStyle':
      return patch(doc, cmd.id, (p) => {
        if (!cmd.keys) return omit(p, 'style');
        const next = { ...p.style };
        for (const k of cmd.keys) delete next[k];
        return Object.keys(next).length ? { ...p, style: next } : omit(p, 'style');
      });

    case 'setHidden':
      return patch(doc, cmd.id, (p) => (cmd.hidden ? { ...p, hidden: true } : omit(p, 'hidden')));

    case 'detach': {
      const next = patch(doc, cmd.id, (p) => ({ ...p, layout: { mode: 'detached', ...cmd.rect } }));
      return next.stack.includes(cmd.id) ? next : { ...next, stack: [...next.stack, cmd.id] };
    }

    case 'reflow': {
      const next = patch(doc, cmd.id, (p) => omit(p, 'layout'));
      return { ...next, stack: next.stack.filter((s) => s !== cmd.id) };
    }

    case 'nudge':
      return patch(doc, cmd.id, (p) => {
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

    case 'alignObjects':
      return alignObjects(doc, cmd.ids, cmd.edge);

    case 'order':
      return reorder(doc, cmd.id, cmd.op);
  }
}

/* ------------------------------------------------------------------ */

function patch(doc: SlideDoc, id: NodeId, fn: (p: NodePatch) => NodePatch): SlideDoc {
  const next = fn(doc.patches[id] ?? {});
  const patches = { ...doc.patches };
  if (Object.keys(next).length === 0) delete patches[id];
  else patches[id] = next;
  return { ...doc, patches };
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

/** detached 요소만 정렬 대상이다. 흐름 요소의 위치는 KG 레이아웃이 정한다. */
function alignObjects(doc: SlideDoc, ids: NodeId[], edge: ObjectAlign): SlideDoc {
  const targets = ids
    .map((id) => ({ id, l: doc.patches[id]?.layout }))
    .filter((t): t is { id: NodeId; l: { mode: 'detached'; x: number; y: number; w: number; h: number } } =>
      t.l?.mode === 'detached' && t.l.x !== undefined && t.l.y !== undefined &&
      t.l.w !== undefined && t.l.h !== undefined);
  if (targets.length < 2) return doc;

  const lefts = targets.map((t) => t.l.x);
  const rights = targets.map((t) => t.l.x + t.l.w);
  const tops = targets.map((t) => t.l.y);
  const bottoms = targets.map((t) => t.l.y + t.l.h);
  const minX = Math.min(...lefts);
  const maxX = Math.max(...rights);
  const minY = Math.min(...tops);
  const maxY = Math.max(...bottoms);

  const patches = { ...doc.patches };
  for (const t of targets) {
    const l = { ...t.l };
    switch (edge) {
      case 'left': l.x = minX; break;
      case 'right': l.x = maxX - l.w; break;
      case 'hcenter': l.x = Math.round((minX + maxX) / 2 - l.w / 2); break;
      case 'top': l.y = minY; break;
      case 'bottom': l.y = maxY - l.h; break;
      case 'vcenter': l.y = Math.round((minY + maxY) / 2 - l.h / 2); break;
    }
    patches[t.id] = { ...patches[t.id], layout: l };
  }
  return { ...doc, patches };
}

function reorder(doc: SlideDoc, id: NodeId, op: 'front' | 'back' | 'forward' | 'backward'): SlideDoc {
  const i = doc.stack.indexOf(id);
  if (i < 0) return doc;
  const stack = [...doc.stack];
  stack.splice(i, 1);
  const at =
    op === 'front' ? stack.length :
    op === 'back' ? 0 :
    op === 'forward' ? Math.min(i + 1, stack.length) :
    Math.max(i - 1, 0);
  stack.splice(at, 0, id);
  return { ...doc, stack };
}
