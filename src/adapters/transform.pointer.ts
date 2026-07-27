/**
 * 선택·이동·리사이즈 — 포인터 이벤트만 쓴다.
 *
 * 드래그 라이브러리를 넣지 않은 이유: 필요한 동작이 "누르고, 끌고, 놓는다" 세 가지뿐이고
 * 좌표 변환(캔버스 배율)은 어차피 직접 해야 해서 라이브러리를 붙여도 줄어드는 코드가 없다.
 *
 * 하이브리드 규칙
 *  - 본체를 끌면: flow 요소는 미세 이동(nudge), detached 요소는 좌표 이동.
 *  - 핸들을 끌면: flow 요소는 그 순간 자동으로 떼어낸 뒤(detach) 크기를 바꾼다.
 *
 * 끄는 동안에는 커맨드를 보내지 않는다. 미리보기는 인라인 스타일로 그리고,
 * 손을 뗄 때 한 번만 보낸다. 이력이 드래그 한 번당 한 칸으로 남는다.
 */
import type { NodeId } from '@contract/index';
import { byId, canvasRect, closestNode, idOf, type Store } from '@core/index';

/** 격자 스냅 단위(px). KG 간격 토큰 --sp-1 과 같다. Alt 를 누르면 해제된다. */
const SNAP = 4;
const DRAG_THRESHOLD = 3;

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface TransformOptions {
  /** 배율이 걸리지 않은 기준 컨테이너. 선택 오버레이가 여기 붙는다. */
  stage: HTMLElement;
  /** 현재 렌더된 .kg-slide */
  getRoot(): HTMLElement | null;
  /** 캔버스에 적용된 CSS 배율 */
  getScale(): number;
  store: Store;
  onSelectionChange?(ids: NodeId[]): void;
}

export interface TransformController {
  select(ids: NodeId[]): void;
  selection(): NodeId[];
  /** 캔버스를 다시 그린 뒤 호출한다. 오버레이 위치를 맞춘다. */
  refresh(): void;
  destroy(): void;
}

interface DragState {
  id: NodeId;
  el: HTMLElement;
  handle: Handle | null;
  originX: number;
  originY: number;
  start: { x: number; y: number; w: number; h: number };
  detached: boolean;
  moved: boolean;
}

export function createTransform(opts: TransformOptions): TransformController {
  const { stage, store } = opts;

  const layer = document.createElement('div');
  layer.className = 'ed-overlay';
  stage.appendChild(layer);

  let selection: NodeId[] = [];
  let drag: DragState | null = null;

  /* ---------- 선택 ---------- */

  const setSelection = (ids: NodeId[]) => {
    selection = ids;
    paint();
    opts.onSelectionChange?.(ids);
  };

  const onPointerDown = (e: PointerEvent) => {
    // 텍스트 편집이 열려 있는 요소 안에서는 선택·드래그가 개입하지 않는다.
    if ((e.target as Element | null)?.closest('[data-kg-editing]')) return;

    const handleEl = (e.target as Element | null)?.closest<HTMLElement>('.ed-handle');
    const root = opts.getRoot();
    if (!root) return;

    if (handleEl) {
      const id = handleEl.dataset['for'];
      if (id) beginDrag(e, id, handleEl.dataset['handle'] as Handle);
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
    if (next.length === 1) beginDrag(e, id, null);
  };

  /* ---------- 끌기 ---------- */

  function beginDrag(e: PointerEvent, id: NodeId, handle: Handle | null) {
    const root = opts.getRoot();
    if (!root) return;

    // 핸들을 잡았는데 아직 흐름 안에 있으면, 지금 떼어낸다.
    let doc = store.get();
    if (handle && doc.patches[id]?.layout?.mode !== 'detached') {
      const el = byId(root, id);
      if (!el) return;
      store.dispatch({ type: 'detach', id, rect: canvasRect(root, el, opts.getScale()) });
      doc = store.get();
    }

    const liveRoot = opts.getRoot();
    const el = liveRoot ? byId(liveRoot, id) : null;
    if (!el || !liveRoot) return;

    drag = {
      id,
      el,
      handle,
      originX: e.clientX,
      originY: e.clientY,
      start: canvasRect(liveRoot, el, opts.getScale()),
      detached: doc.patches[id]?.layout?.mode === 'detached',
      moved: false,
    };
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
    const raw = { dx: (e.clientX - drag.originX) / scale, dy: (e.clientY - drag.originY) / scale };
    if (!drag.moved && Math.hypot(raw.dx * scale, raw.dy * scale) < DRAG_THRESHOLD) return;
    drag.moved = true;

    const snap = (v: number) => (e.altKey ? Math.round(v) : Math.round(v / SNAP) * SNAP);
    const dx = snap(raw.dx);
    const dy = snap(raw.dy);

    if (drag.handle) previewResize(drag, drag.handle, dx, dy);
    else previewMove(drag, dx, dy);
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
    const rect = canvasRect(root, d.el, opts.getScale());

    if (d.handle) {
      store.dispatch({ type: 'setRect', id: d.id, rect });
    } else if (d.detached) {
      store.dispatch({ type: 'setRect', id: d.id, rect: { x: rect.x, y: rect.y } });
    } else {
      store.dispatch({ type: 'nudge', id: d.id, dx: rect.x - d.start.x, dy: rect.y - d.start.y });
    }
  };

  function previewMove(d: DragState, dx: number, dy: number) {
    if (d.detached) {
      d.el.style.left = `${d.start.x + dx}px`;
      d.el.style.top = `${d.start.y + dy}px`;
    } else {
      const base = store.get().patches[d.id]?.layout;
      d.el.style.transform = `translate(${(base?.dx ?? 0) + dx}px, ${(base?.dy ?? 0) + dy}px)`;
    }
  }

  function previewResize(d: DragState, handle: Handle, dx: number, dy: number) {
    const s = d.start;
    const west = handle.includes('w');
    const east = handle.includes('e');
    const north = handle.startsWith('n');
    const south = handle.startsWith('s');

    const x = west ? s.x + dx : s.x;
    const y = north ? s.y + dy : s.y;
    const w = east ? s.w + dx : west ? s.w - dx : s.w;
    const h = south ? s.h + dy : north ? s.h - dy : s.h;

    d.el.style.left = `${x}px`;
    d.el.style.top = `${y}px`;
    d.el.style.width = `${Math.max(8, w)}px`;
    d.el.style.height = `${Math.max(8, h)}px`;
  }

  /* ---------- 키보드 미세 이동 ---------- */

  const onKeyDown = (e: KeyboardEvent) => {
    if (selection.length === 0) return;
    if ((e.target as HTMLElement | null)?.isContentEditable) return;
    const step = e.shiftKey ? 8 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    store.batch(selection.map((id) => ({ type: 'nudge' as const, id, dx: d[0], dy: d[1] })));
  };

  /* ---------- 오버레이 ---------- */

  function paint() {
    const root = opts.getRoot();
    layer.replaceChildren();
    if (!root || selection.length === 0) return;

    const base = stage.getBoundingClientRect();
    const single = selection.length === 1;
    const doc = store.get();

    for (const id of selection) {
      const el = byId(root, id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const box = document.createElement('div');
      box.className = 'ed-selbox';
      box.dataset['mode'] = doc.patches[id]?.layout?.mode === 'detached' ? 'detached' : 'flow';
      box.style.left = `${r.left - base.left}px`;
      box.style.top = `${r.top - base.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;

      if (single) {
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
  window.addEventListener('keydown', onKeyDown);

  return {
    select: setSelection,
    selection: () => selection,
    refresh: paint,
    destroy() {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      layer.remove();
    },
  };
}

function toggle(list: NodeId[], id: NodeId): NodeId[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
