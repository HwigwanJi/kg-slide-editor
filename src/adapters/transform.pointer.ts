/**
 * 선택·이동·크기 조절 — 포인터 이벤트만 쓴다.
 *
 * 드래그 라이브러리를 넣지 않은 이유: 필요한 동작이 "누르고, 끌고, 놓는다" 세 가지뿐이고
 * 좌표 변환(캔버스 배율)은 어차피 직접 해야 해서 라이브러리를 붙여도 줄어드는 코드가 없다.
 *
 * 디자인 도구 관습을 그대로 따른다
 *   드래그              이동
 *   Ctrl+드래그         복사하며 이동
 *   핸들 드래그         크기 조절. 여러 개를 골랐으면 합집합 사각형이 통째로 변형된다
 *   Shift+핸들          가로세로 비율 유지
 *   Ctrl+핸들 (다중)    합집합이 아니라 개체마다 제자리에서 각각 조절
 *   Alt                 격자 스냅 해제
 *   빈 곳 드래그        영역 선택 (포함/교차 두 방식, Shift 뒤집기·Ctrl 더하기·Alt 빼기)
 *
 * 끄는 동안에는 커맨드를 보내지 않는다. 미리보기는 인라인 스타일로 그리고,
 * 손을 뗄 때 한 번만 보낸다. 이력이 드래그 한 번당 한 칸으로 남는다.
 *
 * 키보드는 여기서 다루지 않는다. 단축키의 진실은 app/actions.ts 한 곳이다.
 */
import { ANCHOR_ORIGIN, type NodeId } from '@contract/index';
import {
  byId, canvasRect, closestNode, editable, expandSelection, idOf, isLocked,
  type Command, type SlideStore,
} from '@core/index';

/** 격자 스냅 단위(px). KG 간격 토큰 --sp-1 과 같다. Alt 를 누르면 해제된다. */
const SNAP = 4;
const DRAG_THRESHOLD = 3;
const MIN_SIZE = 8;

/**
 * 영역 드래그 방식. CAD 관습을 그대로 쓴다.
 *  contain  포함 선택 — 상자가 통째로 들어온 것만. 실선으로 그린다.
 *  cross    교차 선택 — 조금이라도 걸치면. 점선으로 그린다.
 */
export type MarqueeMode = 'contain' | 'cross';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** 핸들의 반대편 — 크기를 바꿀 때 붙박아 둘 지점 */
const OPPOSITE: Record<Handle, keyof typeof ANCHOR_ORIGIN> = {
  nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e',
};

interface Rect { x: number; y: number; w: number; h: number }

export interface TransformOptions {
  /** 배율이 걸리지 않은 기준 컨테이너. 선택 오버레이가 여기 붙는다. */
  stage: HTMLElement;
  getRoot(): HTMLElement | null;
  getScale(): number;
  store: SlideStore;
  onSelectionChange?(ids: NodeId[]): void;
  /** Ctrl+드래그 복사. 복제된 새 노드 id 를 돌려준다. 액션 계층이 넣어 준다. */
  duplicate?(ids: NodeId[]): NodeId[];
}

export interface TransformController {
  select(ids: NodeId[]): void;
  selection(): NodeId[];
  refresh(): void;
  setMarqueeMode(mode: MarqueeMode): void;
  marqueeMode(): MarqueeMode;
  destroy(): void;
}

interface MarqueeState {
  originX: number;
  originY: number;
  x: number;
  y: number;
  /** 시작할 때 눌려 있던 수식어로 정한 합치는 방식 */
  merge: 'replace' | 'add' | 'subtract' | 'toggle';
  box: HTMLElement;
  moved: boolean;
}

interface Target {
  id: NodeId;
  el: HTMLElement;
  start: Rect;
  detached: boolean;
}

interface DragState {
  targets: Target[];
  handle: Handle | null;
  /** 크기 조절 시작 시점의 합집합 사각형 */
  union: Rect;
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
  let marquee: MarqueeState | null = null;
  let marqueeMode: MarqueeMode = 'cross';

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
      // 여러 개를 고른 상태의 핸들은 선택 전체를 대상으로 한다.
      const only = handleEl.dataset['for'];
      const ids = only && selection.length <= 1 ? [only] : selection;
      beginDrag(e, ids, handleEl.dataset['handle'] as Handle);
      return;
    }

    const node = closestNode(e.target);
    const id = idOf(node);
    if (!id || !node || node === root) {
      beginMarquee(e);
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

    // 크기를 바꾸려면 좌표가 있어야 한다. 자동 배치 상태면 그 순간 떼어낸다.
    if (handle) {
      const scale = opts.getScale();
      const detachCmds: Command[] = [];
      for (const id of targetIds) {
        if (doc.patches[id]?.layout?.mode === 'detached') continue;
        const el = byId(root, id);
        if (el) detachCmds.push({ type: 'detach', id, rect: canvasRect(root, el, scale) });
      }
      if (detachCmds.length) {
        store.batch(detachCmds);
        doc = store.get();
      }
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

    drag = {
      targets,
      handle,
      union: unionOf(targets.map((t) => t.start)),
      originX: e.clientX,
      originY: e.clientY,
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
    if (marquee) {
      marquee.x = e.clientX;
      marquee.y = e.clientY;
      if (Math.hypot(marquee.x - marquee.originX, marquee.y - marquee.originY) >= DRAG_THRESHOLD) {
        marquee.moved = true;
      }
      paintMarquee();
      return;
    }
    if (!drag) return;
    const scale = opts.getScale() || 1;
    const rawX = (e.clientX - drag.originX) / scale;
    const rawY = (e.clientY - drag.originY) / scale;
    if (!drag.moved && Math.hypot(rawX * scale, rawY * scale) < DRAG_THRESHOLD) return;
    drag.moved = true;

    const snap = (v: number) => (e.altKey ? Math.round(v) : Math.round(v / SNAP) * SNAP);
    const dx = snap(rawX);
    const dy = snap(rawY);

    if (drag.handle) previewResize(drag, drag.handle, dx, dy, e);
    else for (const t of drag.targets) previewMove(t, dx, dy);
    paint();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (marquee) {
      const m = marquee;
      marquee = null;
      capture(e.pointerId, false);
      m.box.remove();
      // 끌지 않고 눌렀다 뗀 것은 빈 곳을 클릭한 것이다 — 선택을 푼다.
      if (!m.moved) setSelection([]);
      else setSelection(mergeSelection(selection, hitsIn(m), m.merge));
      return;
    }

    const d = drag;
    drag = null;
    if (!d) return;
    capture(e.pointerId, false);
    if (!d.moved) return;

    const root = opts.getRoot();
    if (!root) return;
    const scale = opts.getScale();

    if (d.handle) {
      store.batch(d.targets.map((t) => ({
        type: 'setRect' as const, id: t.id, rect: canvasRect(root, t.el, scale),
      })));
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

  /**
   * 크기 조절.
   *
   * 먼저 합집합 사각형을 새로 구하고, 그 변형 비율을 개체들에 옮긴다.
   * 기본은 합집합 안에서의 상대 위치까지 함께 늘어난다(여러 개를 한 덩어리로 키우는 동작).
   * Ctrl 을 누르면 위치는 그대로 두고 개체마다 제자리에서 각각 커진다.
   */
  function previewResize(d: DragState, handle: Handle, dx: number, dy: number, e: PointerEvent) {
    const next = resizeRect(d.union, handle, dx, dy, e.shiftKey);
    const sx = d.union.w === 0 ? 1 : next.w / d.union.w;
    const sy = d.union.h === 0 ? 1 : next.h / d.union.h;
    const individually = (e.ctrlKey || e.metaKey) && d.targets.length > 1;
    const [ox, oy] = ANCHOR_ORIGIN[OPPOSITE[handle]];

    for (const t of d.targets) {
      const w = Math.max(MIN_SIZE, Math.round(t.start.w * sx));
      const h = Math.max(MIN_SIZE, Math.round(t.start.h * sy));
      const x = individually
        ? Math.round(t.start.x + (t.start.w - w) * ox)
        : Math.round(next.x + (t.start.x - d.union.x) * sx);
      const y = individually
        ? Math.round(t.start.y + (t.start.h - h) * oy)
        : Math.round(next.y + (t.start.y - d.union.y) * sy);

      t.el.style.left = `${x}px`;
      t.el.style.top = `${y}px`;
      t.el.style.width = `${w}px`;
      t.el.style.height = `${h}px`;
    }
  }

  /** 핸들을 끈 만큼 사각형을 다시 계산한다. keepRatio 면 큰 쪽 변화에 맞춰 비율을 지킨다. */
  function resizeRect(r: Rect, handle: Handle, dx: number, dy: number, keepRatio: boolean): Rect {
    const west = handle.includes('w');
    const east = handle.includes('e');
    const north = handle.startsWith('n');
    const south = handle.startsWith('s');

    let w = Math.max(MIN_SIZE, east ? r.w + dx : west ? r.w - dx : r.w);
    let h = Math.max(MIN_SIZE, south ? r.h + dy : north ? r.h - dy : r.h);

    if (keepRatio && r.w > 0 && r.h > 0) {
      // 모서리 핸들은 더 많이 움직인 축을 따르고, 변 핸들은 그 축만 보고 나머지를 맞춘다.
      const ratio = r.h / r.w;
      const byWidth = (east || west) && (!(north || south) || Math.abs(w / r.w - 1) >= Math.abs(h / r.h - 1));
      if (byWidth) h = Math.max(MIN_SIZE, Math.round(w * ratio));
      else w = Math.max(MIN_SIZE, Math.round(h / ratio));
    }

    return {
      x: west ? r.x + (r.w - w) : r.x,
      y: north ? r.y + (r.h - h) : r.y,
      w,
      h,
    };
  }

  /* ---------- 영역 드래그 ---------- */

  /**
   * 빈 곳에서 시작한 드래그는 영역 선택이다.
   *
   * 수식어는 그림 도구들의 관습을 따른다.
   *   없음   새로 고른다
   *   Shift  뒤집는다 — 이미 고른 것은 풀고, 안 고른 것은 고른다
   *   Ctrl   더한다
   *   Alt    뺀다
   */
  function beginMarquee(e: PointerEvent) {
    const box = document.createElement('div');
    box.className = 'ed-marquee';
    box.dataset['mode'] = marqueeMode;
    layer.appendChild(box);

    marquee = {
      originX: e.clientX, originY: e.clientY, x: e.clientX, y: e.clientY,
      merge: e.shiftKey ? 'toggle' : e.ctrlKey || e.metaKey ? 'add' : e.altKey ? 'subtract' : 'replace',
      box, moved: false,
    };
    capture(e.pointerId, true);
    e.preventDefault();
  }

  function marqueeRect(m: MarqueeState): DOMRect {
    const left = Math.min(m.originX, m.x);
    const top = Math.min(m.originY, m.y);
    return new DOMRect(left, top, Math.abs(m.x - m.originX), Math.abs(m.y - m.originY));
  }

  function paintMarquee() {
    if (!marquee) return;
    const base = stage.getBoundingClientRect();
    const r = marqueeRect(marquee);
    marquee.box.style.left = `${r.left - base.left}px`;
    marquee.box.style.top = `${r.top - base.top}px`;
    marquee.box.style.width = `${r.width}px`;
    marquee.box.style.height = `${r.height}px`;
  }

  /**
   * 영역에 걸린 개체들.
   *
   * 묶음(그리드 칸·열)까지 잡으면 끌 때마다 장표 절반이 선택된다.
   * 그래서 사람이 개체로 여기는 것만 후보로 둔다 — 글자 덩어리, 떼어낸 것, 넣은 것,
   * 그리고 더 안쪽이 없는 말단 요소.
   */
  function hitsIn(m: MarqueeState): NodeId[] {
    const root = opts.getRoot();
    if (!root) return [];
    const doc = store.get();
    const area = marqueeRect(m);
    const found: NodeId[] = [];

    for (const el of root.querySelectorAll<HTMLElement>(`[${'data-kg-id'}]`)) {
      const id = el.getAttribute('data-kg-id');
      if (!id || id === 'n' || el.closest('.kg-slot')) continue;
      if (isLocked(doc, id)) continue;

      const isObject = el.hasAttribute('data-kg-text')
        || doc.patches[id]?.layout?.mode === 'detached'
        || el.children.length === 0;
      if (!isObject) continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      const hit = marqueeMode === 'contain'
        ? r.left >= area.left && r.right <= area.right && r.top >= area.top && r.bottom <= area.bottom
        : r.left < area.right && area.left < r.right && r.top < area.bottom && area.top < r.bottom;
      if (hit) found.push(id);
    }
    return found;
  }

  function mergeSelection(current: NodeId[], hits: NodeId[], how: MarqueeState['merge']): NodeId[] {
    switch (how) {
      case 'replace': return hits;
      case 'add': return [...new Set([...current, ...hits])];
      case 'subtract': return current.filter((id) => !hits.includes(id));
      case 'toggle': return [
        ...current.filter((id) => !hits.includes(id)),
        ...hits.filter((id) => !current.includes(id)),
      ];
    }
  }

  /* ---------- 오버레이 ---------- */

  function paint() {
    const root = opts.getRoot();
    layer.replaceChildren();
    if (!root || selection.length === 0) return;

    const base = stage.getBoundingClientRect();
    const doc = store.get();
    const boxes: DOMRect[] = [];
    let anyEditable = false;

    for (const id of selection) {
      const el = byId(root, id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      boxes.push(r);
      if (!isLocked(doc, id)) anyEditable = true;

      const box = document.createElement('div');
      box.className = 'ed-selbox';
      box.dataset['mode'] = doc.patches[id]?.layout?.mode === 'detached' ? 'detached' : 'flow';
      if (isLocked(doc, id)) box.dataset['locked'] = '';
      place(box, r, base);

      // 하나만 골랐을 때는 그 상자에 바로 핸들을 붙인다.
      if (selection.length === 1 && !isLocked(doc, id)) addHandles(box, id);
      layer.appendChild(box);
    }

    // 여러 개를 골랐으면 합집합 사각형에 핸들을 붙인다. 한 덩어리로 다루기 위한 것.
    if (boxes.length > 1 && anyEditable) {
      const hull = document.createElement('div');
      hull.className = 'ed-selbox ed-selbox--group';
      place(hull, unionRect(boxes), base);
      addHandles(hull, '');
      layer.appendChild(hull);
    }
  }

  function place(box: HTMLElement, r: DOMRect | Rect, base: DOMRect) {
    const left = 'left' in r ? r.left : r.x;
    const top = 'top' in r ? r.top : r.y;
    box.style.left = `${left - base.left}px`;
    box.style.top = `${top - base.top}px`;
    box.style.width = `${'width' in r ? r.width : r.w}px`;
    box.style.height = `${'height' in r ? r.height : r.h}px`;
  }

  function addHandles(box: HTMLElement, forId: string) {
    for (const h of HANDLES) {
      const dot = document.createElement('div');
      dot.className = 'ed-handle';
      dot.dataset['handle'] = h;
      if (forId) dot.dataset['for'] = forId;
      box.appendChild(dot);
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
    setMarqueeMode: (mode) => { marqueeMode = mode; },
    marqueeMode: () => marqueeMode,
    destroy() {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      layer.remove();
    },
  };
}

function unionOf(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

function unionRect(rects: DOMRect[]): Rect {
  const x = Math.min(...rects.map((r) => r.left));
  const y = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { x, y, w: right - x, h: bottom - y };
}

function toggle(list: NodeId[], id: NodeId): NodeId[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
