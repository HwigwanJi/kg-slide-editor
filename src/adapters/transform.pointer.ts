/**
 * 선택·이동·리사이즈 — 포인터 이벤트만 쓴다.
 *
 * 드래그 라이브러리를 넣지 않은 이유: 필요한 동작이 "누르고, 끌고, 놓는다" 세 가지뿐이고
 * 좌표 변환(캔버스 배율)은 어차피 직접 해야 해서 라이브러리를 붙여도 줄어드는 코드가 없다.
 *
 * PPT 관습
 *  - 드래그          : 이동. 흐름 요소는 미세 이동, 떼어낸 요소는 좌표 이동.
 *  - Ctrl+드래그     : 복사하며 이동.
 *  - 핸들 드래그     : 크기 조절. 흐름 요소는 그 순간 자동으로 떼어낸다.
 *  - Shift+클릭      : 선택 추가.
 *  - Alt             : 격자 스냅 해제.
 *
 * 끄는 동안에는 커맨드를 보내지 않는다. 미리보기는 인라인 스타일로 그리고,
 * 손을 뗄 때 한 번만 보낸다. 이력이 드래그 한 번당 한 칸으로 남는다.
 *
 * 키보드는 여기서 다루지 않는다. 단축키의 진실은 app/actions.ts 한 곳이다.
 */
import type { NodeId } from '@contract/index';
import {
  byId, canvasRect, closestNode, editable, expandSelection, idOf, isLocked,
  type Command, type Store,
} from '@core/index';

/** 격자 스냅 단위(px). KG 간격 토큰 --sp-1 과 같다. Alt 를 누르면 해제된다. */
const SNAP = 4;
const DRAG_THRESHOLD = 3;

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface TransformOptions {
  /** 배율이 걸리지 않은 기준 컨테이너. 선택 오버레이가 여기 붙는다. */
  stage: HTMLElement;
  getRoot(): HTMLElement | null;
  getScale(): number;
  store: Store;
  onSelectionChange?(ids: NodeId[]): void;
  /** Ctrl+드래그 복사. 복제된 새 노드 id 를 돌려준다. 액션 계층이 넣어 준다. */
  duplicate?(ids: NodeId[]): NodeId[];
}

export interface TransformController {
  select(ids: NodeId[]): void;
  selection(): NodeId[];
  /** 캔버스를 다시 그린 뒤 호출한다. 오버레이 위치를 맞춘다. */
  refresh(): void;
  destroy(): void;
}

interface Target {
  id: NodeId;
  el: HTMLElement;
  start: { x: number; y: number; w: number; h: number };
  detached: boolean;
}

interface DragState {
  targets: Target[];
  handle: Handle | null;
  originX: number;
  originY: number;
  moved: boolean;
}

export function createTransform(opts: TransformOptions): TransformController {
  const { stage, store } = opts;

  const layer = document.createElement('div');
  layer.className = 'ed-overlay';
  stage.appendChild(layer);

  let selection: NodeId[] = [];
  let drag: DragState | null = null;

  const setSelection = (ids: NodeId[]) => {
    selection = expandSelection(store.get(), [...new Set(ids)]);
    paint();
    opts.onSelectionChange?.(selection);
  };

  /* ---------- 선택 ---------- */

  const onPointerDown = (e: PointerEvent) => {
    // 텍스트 편집이 열려 있는 요소 안에서는 선택·드래그가 개입하지 않는다.
    if ((e.target as Element | null)?.closest('[data-kg-editing]')) return;

    const root = opts.getRoot();
    if (!root) return;

    const handleEl = (e.target as Element | null)?.closest<HTMLElement>('.ed-handle');
    if (handleEl) {
      const id = handleEl.dataset['for'];
      if (id) beginDrag(e, [id], handleEl.dataset['handle'] as Handle);
      return;
    }

    const node = closestNode(e.target);
    const id = idOf(node);
    if (!id || !node || node === root) {
      setSelection([]);
      return;
    }

    const next = e.shiftKey ? toggle(selection, id) : [id];
    setSelection(next);
    beginDrag(e, selection, null);
  };

  /* ---------- 끌기 ---------- */

  function beginDrag(e: PointerEvent, ids: NodeId[], handle: Handle | null) {
    const root = opts.getRoot();
    if (!root) return;

    let doc = store.get();
    let targetIds = editable(doc, ids);
    if (targetIds.length === 0) return;

    // Ctrl+드래그 = 복사하며 이동. 먼저 복제하고, 끄는 대상은 복제본으로 바꾼다.
    if (!handle && (e.ctrlKey || e.metaKey) && opts.duplicate) {
      const copies = opts.duplicate(targetIds);
      if (copies.length) {
        targetIds = copies;
        setSelection(copies);
        doc = store.get();
      }
    }

    // 핸들을 잡았는데 아직 흐름 안에 있으면, 지금 떼어낸다.
    if (handle) {
      const id = targetIds[0]!;
      if (doc.patches[id]?.layout?.mode !== 'detached') {
        const el = byId(opts.getRoot() ?? root, id);
        if (!el) return;
        store.dispatch({ type: 'detach', id, rect: canvasRect(root, el, opts.getScale()) });
        doc = store.get();
      }
      targetIds = [id];
    }

    const liveRoot = opts.getRoot();
    if (!liveRoot) return;
    const scale = opts.getScale();

    const targets: Target[] = [];
    for (const id of targetIds) {
      const el = byId(liveRoot, id);
      if (!el) continue;
      targets.push({
        id,
        el,
        start: canvasRect(liveRoot, el, scale),
        detached: doc.patches[id]?.layout?.mode === 'detached',
      });
    }
    if (targets.length === 0) return;

    drag = { targets, handle, originX: e.clientX, originY: e.clientY, moved: false };
    capture(e.pointerId, true);
    e.preventDefault();
  }

  /** 포인터가 이미 사라진 뒤 호출되면 던진다. 드래그를 중단시킬 만한 일이 아니므로 삼킨다. */
  function capture(pointerId: number, on: boolean): void {
    try {
      if (on) stage.setPointerCapture(pointerId);
      else stage.releasePointerCapture(pointerId);
    } catch {
      /* noop */
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    const scale = opts.getScale() || 1;
    const rawX = (e.clientX - drag.originX) / scale;
    const rawY = (e.clientY - drag.originY) / scale;
    if (!drag.moved && Math.hypot(rawX * scale, rawY * scale) < DRAG_THRESHOLD) return;
    drag.moved = true;

    const snap = (v: number) => (e.altKey ? Math.round(v) : Math.round(v / SNAP) * SNAP);
    const dx = snap(rawX);
    const dy = snap(rawY);

    if (drag.handle) previewResize(drag.targets[0]!, drag.handle, dx, dy);
    else for (const t of drag.targets) previewMove(t, dx, dy);
    paint();
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = drag;
    drag = null;
    if (!d) return;
    capture(e.pointerId, false);
    if (!d.moved) return;

    const root = opts.getRoot();
    if (!root) return;
    const scale = opts.getScale();

    if (d.handle) {
      const t = d.targets[0]!;
      store.dispatch({ type: 'setRect', id: t.id, rect: canvasRect(root, t.el, scale) });
      return;
    }

    const moved = d.targets.map((t) => ({ t, rect: canvasRect(root, t.el, scale) }));
    const cmds: Command[] = moved
      .filter((m) => m.t.detached)
      .map(({ t, rect }) => ({ type: 'setRect', id: t.id, rect: { x: rect.x, y: rect.y } }));

    // 흐름 요소는 같은 오프셋만큼 함께 움직이므로 한 커맨드로 묶는다.
    const flowing = moved.filter((m) => !m.t.detached);
    const first = flowing[0];
    if (first) {
      cmds.push({
        type: 'nudge',
        ids: flowing.map((m) => m.t.id),
        dx: first.rect.x - first.t.start.x,
        dy: first.rect.y - first.t.start.y,
      });
    }
    if (cmds.length) store.batch(cmds);
  };

  function previewMove(t: Target, dx: number, dy: number) {
    if (t.detached) {
      t.el.style.left = `${t.start.x + dx}px`;
      t.el.style.top = `${t.start.y + dy}px`;
    } else {
      const base = store.get().patches[t.id]?.layout;
      t.el.style.transform = `translate(${(base?.dx ?? 0) + dx}px, ${(base?.dy ?? 0) + dy}px)`;
    }
  }

  function previewResize(t: Target, handle: Handle, dx: number, dy: number) {
    const s = t.start;
    const west = handle.includes('w');
    const east = handle.includes('e');
    const north = handle.startsWith('n');
    const south = handle.startsWith('s');

    t.el.style.left = `${west ? s.x + dx : s.x}px`;
    t.el.style.top = `${north ? s.y + dy : s.y}px`;
    t.el.style.width = `${Math.max(8, east ? s.w + dx : west ? s.w - dx : s.w)}px`;
    t.el.style.height = `${Math.max(8, south ? s.h + dy : north ? s.h - dy : s.h)}px`;
  }

  /* ---------- 오버레이 ---------- */

  function paint() {
    const root = opts.getRoot();
    layer.replaceChildren();
    if (!root || selection.length === 0) return;

    const base = stage.getBoundingClientRect();
    const doc = store.get();
    const single = selection.length === 1;

    for (const id of selection) {
      const el = byId(root, id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const box = document.createElement('div');
      box.className = 'ed-selbox';
      box.dataset['mode'] = doc.patches[id]?.layout?.mode === 'detached' ? 'detached' : 'flow';
      if (isLocked(doc, id)) box.dataset['locked'] = '';
      box.style.left = `${r.left - base.left}px`;
      box.style.top = `${r.top - base.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;

      if (single && !isLocked(doc, id)) {
        for (const h of HANDLES) {
          const dot = document.createElement('div');
          dot.className = 'ed-handle';
          dot.dataset['handle'] = h;
          dot.dataset['for'] = id;
          box.appendChild(dot);
        }
      }
      layer.appendChild(box);
    }
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);

  return {
    select: setSelection,
    selection: () => selection,
    refresh: paint,
    destroy() {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      layer.remove();
    },
  };
}

function toggle(list: NodeId[], id: NodeId): NodeId[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
