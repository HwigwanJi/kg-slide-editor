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
 * "빈 곳" 은 아무것도 없는 자리가 아니라 묶음 껍데기까지 포함한다. 자세한 것은 pickable().
 * 영역 드래그는 장표 바깥 여백에서 시작하고 끝낼 수 있다 — 가장자리 개체를 고르려면 필요하다.
 *
 * 끄는 동안에는 커맨드를 보내지 않는다. 미리보기는 인라인 스타일로 그리고,
 * 손을 뗄 때 한 번만 보낸다. 이력이 드래그 한 번당 한 칸으로 남는다.
 *
 * 키보드는 여기서 다루지 않는다. 단축키의 진실은 app/actions.ts 한 곳이다.
 */
import {
  ANCHOR_ORIGIN, BACKGROUND_SELECTORS, ROOT_ID, type NodeId, type SlideDoc,
} from '@contract/index';
import {
  BLIND_ATTR, byId, canvasRect, closestNode, editable, expandSelection, idOf, isLocked, isRemoved,
  kindOf,
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
  /**
   * 포인터를 받는 바깥 영역. 장표 둘레의 여백까지 포함한다.
   * 이벤트를 장표에만 걸면 여백에서 영역 드래그를 시작할 수 없다 —
   * 가장자리 개체를 고르려면 바깥에서 안으로 훑어 들어와야 하므로 여백이 곧 작업 공간이다.
   */
  host: HTMLElement;
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
  /** 형광펜을 들고 있는가. 들고 있으면 드래그가 선택이 아니라 칠하기가 된다. */
  blindPaint(): boolean;
  setBlindPaint(on: boolean): void;
  destroy(): void;
}

/**
 * 형광펜 한 획.
 *
 * 지나간 자리를 모아 두었다가 손을 뗄 때 한 번만 커맨드로 보낸다. 지나갈 때마다 보내면
 * 되돌리기가 획 하나에 수십 칸으로 쌓여 한 번 눌러서는 원래대로 돌아가지 않는다.
 *
 * 칠할지 지울지는 **획을 시작할 때 한 번** 정한다. 지나가면서 매번 뒤집으면 같은 자리를
 * 두 번 스치는 순간 도로 원래대로 돌아가, 손이 떨릴 때마다 결과가 달라진다.
 */
interface PaintState {
  erasing: boolean;
  /** 이 획이 지나온 자리 */
  touched: Set<NodeId>;
  lastX: number;
  lastY: number;
  moved: boolean;
}

/** 붓 굵기(화면 px). 지나간 선 둘레 이만큼을 훑는다. */
const BRUSH = 8;

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
  const { host, stage, store } = opts;

  const layer = document.createElement('div');
  layer.className = 'ed-overlay';
  stage.appendChild(layer);

  /**
   * 영역 상자는 장표 밖까지 나가므로 오버레이가 아니라 따로 둔다.
   * 오버레이 안에 두면 장표 상자를 넘겨 그리게 되어 캔버스에 없던 스크롤이 생긴다.
   */
  const marqueeLayer = document.createElement('div');
  marqueeLayer.className = 'ed-marquee-layer';
  host.appendChild(marqueeLayer);

  let selection: NodeId[] = [];
  let drag: DragState | null = null;
  let marquee: MarqueeState | null = null;
  let marqueeMode: MarqueeMode = 'cross';
  let paintOn = false;
  let paintStroke: PaintState | null = null;

  const setSelection = (ids: NodeId[]) => {
    selection = expandSelection(store.get(), [...new Set(ids)]);
    paint();
    opts.onSelectionChange?.(selection);
  };

  /* ---------- 선택 ---------- */

  /**
   * 사람이 집는 개체인가.
   *
   * 배경 — 장표를 떠받치는 판 — 은 집히지 않는다. 화면을 거의 다 덮고 있어서 집히게 두면
   * 빈 곳이 남지 않아 영역 드래그를 시작할 자리가 사라진다. 무엇이 배경인지는 이름으로 정한다
   * (계약 BACKGROUND_SELECTORS).
   *
   * 그 밖에는 **제 모습이 있으면 집힌다.** 배경색이든 테두리든 제 모습을 가진 것은
   * 사람 눈에 개체로 보이고, 보이는 것은 집혀야 한다.
   * 칸만 나누는 투명한 껍데기는 여전히 지나친다 — 잡을 것이 없기 때문이다.
   *
   * 떼어냈거나 새로 넣은 것은 무엇이든 집힌다. 그러지 않으면 한 번 놓은 뒤로 만질 방법이 없다.
   */
  function pickable(doc: SlideDoc, el: HTMLElement, id: NodeId): boolean {
    if (doc.patches[id]?.layout?.mode === 'detached') return true;
    if (doc.tree.added[id]) return true;
    if (BACKGROUND_SELECTORS.some((sel) => el.matches(sel))) return false;
    if (kindOf(el) !== 'group') return true;
    // 잠긴 껍데기 — 상단 고정 위계 — 는 예전대로 지나친다. 제 모습이야 있지만 옮기지도
    // 지우지도 못하는 것이라, 집히게 두면 제목 근처를 누를 때마다 띠 전체가 잡힌다.
    if (isLocked(doc, id)) return false;
    return hasOwnLook(el);
  }

  /**
   * 제 모습이 있는가 — 배경색·배경그림·테두리·잘라내기 중 하나라도.
   *
   * kindOf 로는 가릴 수 없다. 그쪽은 글자를 품었는지부터 보기 때문에, 글자가 든 네모박스는
   * 배경이 있어도 도형이 되지 못한다. 여기서는 담긴 내용을 따지지 않고 겉모습만 본다.
   */
  function hasOwnLook(el: HTMLElement): boolean {
    const cs = getComputedStyle(el);
    if (cs.backgroundImage !== 'none' || cs.clipPath !== 'none') return true;
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') return true;
    return ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
      .some((side) => parseFloat(cs[side as 'borderTopWidth']) > 0);
  }

  const onPointerDown = (e: PointerEvent) => {
    // 텍스트 편집이 열려 있는 요소 안에서는 선택·드래그가 개입하지 않는다.
    if ((e.target as Element | null)?.closest('[data-kg-editing]')) return;

    const root = opts.getRoot();
    if (!root) return;

    // 형광펜을 들고 있으면 다른 것은 아무것도 하지 않는다. 고르지도, 끌지도 않는다.
    if (paintOn) {
      beginPaint(e);
      return;
    }

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
    if (!id || !node || node === root || !pickable(store.get(), node, id)) {
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
      if (on) host.setPointerCapture(pointerId);
      else host.releasePointerCapture(pointerId);
    } catch {
      /* noop */
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (paintStroke) {
      strokeTo(e.clientX, e.clientY);
      return;
    }
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
    if (paintStroke) {
      const s = paintStroke;
      paintStroke = null;
      capture(e.pointerId, false);
      if (s.touched.size > 0) {
        store.dispatch({ type: 'setBlind', ids: [...s.touched], on: !s.erasing });
      }
      return;
    }
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
    // 상자를 담을 층을 지금의 캔버스 자리에 맞춘다. 드래그 한 번 동안만 쓰므로 시작 때 한 번이면 된다.
    const h = host.getBoundingClientRect();
    marqueeLayer.style.left = `${h.left}px`;
    marqueeLayer.style.top = `${h.top}px`;
    marqueeLayer.style.width = `${h.width}px`;
    marqueeLayer.style.height = `${h.height}px`;

    const box = document.createElement('div');
    box.className = 'ed-marquee';
    box.dataset['mode'] = marqueeMode;
    marqueeLayer.appendChild(box);

    marquee = {
      originX: e.clientX, originY: e.clientY, x: e.clientX, y: e.clientY,
      merge: e.shiftKey ? 'toggle' : e.ctrlKey || e.metaKey ? 'add' : e.altKey ? 'subtract' : 'replace',
      box, moved: false,
    };
    capture(e.pointerId, true);
    e.preventDefault();
  }

  /* ---------- 형광펜 ---------- */

  /**
   * 획을 시작한다.
   *
   * 시작한 자리가 이미 칠해져 있으면 이 획은 **지우는 획**이다. PPT 형광펜과 달리
   * 색 고르기가 따로 없으므로, 같은 동작으로 칠하고 지울 수 있어야 한다.
   * 무엇을 할지는 첫 자리 하나로 정하고 획이 끝날 때까지 바꾸지 않는다.
   */
  function beginPaint(e: PointerEvent) {
    const first = brushHits(e.clientX, e.clientY, e.clientX, e.clientY)[0];
    const doc = store.get();
    paintStroke = {
      erasing: !!first && isBlinded(doc, first),
      touched: new Set<NodeId>(),
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
    capture(e.pointerId, true);
    e.preventDefault();
    strokeTo(e.clientX, e.clientY);
  }

  /** 이 노드가 지금 가려지는가 — 자기가 칠해졌거나 위쪽이 칠해졌으면 가려진다. */
  function isBlinded(doc: SlideDoc, id: NodeId): boolean {
    const marks = doc.blind?.marks ?? {};
    return id in marks || Object.keys(marks).some((up) => id.startsWith(`${up}.`));
  }

  /**
   * 붓이 지나간 자리를 훑는다.
   *
   * 점이 아니라 **지난번 점에서 지금 점까지의 띠** 로 본다. 포인터 이벤트는 빨리 그으면
   * 듬성듬성 오므로 점으로만 재면 사이가 통째로 빠진다 — 그은 줄 알았는데 안 칠해진다.
   */
  function strokeTo(x: number, y: number) {
    const s = paintStroke;
    if (!s) return;
    if (Math.hypot(x - s.lastX, y - s.lastY) >= DRAG_THRESHOLD) s.moved = true;

    for (const id of brushHits(s.lastX, s.lastY, x, y)) {
      if (s.touched.has(id)) continue;
      s.touched.add(id);
      // 손을 떼기 전에도 결과가 보여야 한다. 커맨드는 뗄 때 한 번만 보내므로 여기서 미리 그린다.
      const el = byId(opts.getRoot()!, id);
      if (!el) continue;
      if (s.erasing) el.removeAttribute(BLIND_ATTR);
      else el.setAttribute(BLIND_ATTR, '');
    }
    s.lastX = x;
    s.lastY = y;
  }

  /**
   * 붓 아래에 걸린 글자 덩어리.
   *
   * 선택과 달리 **글자 덩어리만** 고른다. 가리는 것은 글자이지 상자가 아니다.
   * 상자를 칠하면 그 안이 통째로 별표가 되어, 표 한 칸만 가리려던 것이 표 전체를 덮는다.
   * 글자 없는 그림·도형은 따로 집을 수 있게 남겨 둔다(집힌 상태에서 목록으로 칠한다).
   */
  function brushHits(x0: number, y0: number, x1: number, y1: number): NodeId[] {
    const root = opts.getRoot();
    if (!root) return [];
    const doc = store.get();
    const area = new DOMRect(
      Math.min(x0, x1) - BRUSH, Math.min(y0, y1) - BRUSH,
      Math.abs(x1 - x0) + BRUSH * 2, Math.abs(y1 - y0) + BRUSH * 2,
    );

    const found: NodeId[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('[data-kg-text]')) {
      const id = el.getAttribute('data-kg-id');
      if (!id || el.closest('.kg-slot')) continue;
      // 잠긴 것도 칠할 수 있다. 머리말·꼬리말에도 가려야 할 것이 있다(사명·발주처).
      if (isRemoved(doc, id)) continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < area.right && area.left < r.right && r.top < area.bottom && area.top < r.bottom) {
        found.push(id);
      }
    }
    return found;
  }

  function marqueeRect(m: MarqueeState): DOMRect {
    const left = Math.min(m.originX, m.x);
    const top = Math.min(m.originY, m.y);
    return new DOMRect(left, top, Math.abs(m.x - m.originX), Math.abs(m.y - m.originY));
  }

  function paintMarquee() {
    if (!marquee) return;
    const base = marqueeLayer.getBoundingClientRect();
    const r = marqueeRect(marquee);
    marquee.box.style.left = `${r.left - base.left}px`;
    marquee.box.style.top = `${r.top - base.top}px`;
    marquee.box.style.width = `${r.width}px`;
    marquee.box.style.height = `${r.height}px`;
  }

  /**
   * 영역에 걸린 개체들.
   *
   * 후보 판정은 클릭과 같은 pickable() 을 쓴다. 둘이 어긋나면
   * 영역으로는 잡히는데 눌러서는 안 잡히는 개체가 생긴다.
   */
  function hitsIn(m: MarqueeState): NodeId[] {
    const root = opts.getRoot();
    if (!root) return [];
    const doc = store.get();
    const area = marqueeRect(m);
    const found: NodeId[] = [];

    for (const el of root.querySelectorAll<HTMLElement>(`[${'data-kg-id'}]`)) {
      const id = el.getAttribute('data-kg-id');
      if (!id || id === ROOT_ID || el.closest('.kg-slot')) continue;
      if (isLocked(doc, id)) continue;

      if (!pickable(doc, el, id)) continue;

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

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerUp);

  return {
    select: setSelection,
    selection: () => selection,
    refresh: paint,
    setMarqueeMode: (mode) => { marqueeMode = mode; },
    marqueeMode: () => marqueeMode,
    blindPaint: () => paintOn,
    setBlindPaint(on) {
      paintOn = on;
      // 커서로 지금 무엇을 들고 있는지 알린다. 모드가 화면에 안 보이면
      // 고르려다 칠하고, 칠하려다 고른다.
      host.dataset['paint'] = on ? 'blind' : '';
    },
    destroy() {
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('pointercancel', onPointerUp);
      layer.remove();
      marqueeLayer.remove();
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
