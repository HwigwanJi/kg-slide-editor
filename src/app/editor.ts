/**
 * 편집기 컨트롤러 — 코어·어댑터·DOM을 잇는 배선층.
 *
 * React는 이 객체를 구독만 한다. 장표 DOM은 여기가 소유한다.
 * (React가 장표를 다시 그리려 들면 KG 마크업과 싸우게 되므로 경계를 여기서 자른다)
 *
 * 화면 조각(툴바·패널·메뉴)은 이 파일이 노출한 동작만 부른다. store.patches 를 직접 만지지 않는다.
 * 새 식별자·좌표·마크업처럼 바깥 세계가 필요한 값은 여기서 만들어 커맨드에 넣는다.
 */
import {
  KG_CANVAS, createSlideDoc, loadKgTokens, newGroupId, newNodeId,
  type AddedNode, type Distribute, type KgToken, type NodeId, type ObjectAlign,
  type Role, type RoleStyle, type SlideDoc, type SlideMeta, type StylePatch,
} from '@contract/index';
import {
  auditOverflow, byId, canvasRect, createStore, editable, expandSelection, fitFontSize,
  groupOf, isRemoved, listNodes, readFormat, render, scopeFormat, themeCss, toStandaloneHtml,
  type Command, type FormatScope, type OverflowIssue, type Store,
} from '@core/index';
import {
  SNIPPETS, clipboard, cloneNodeSnapshot, createTransform, downloadDoc, downloadText,
  editText, importKgHtml, importKgHtmlFrom, localAdapter, readDocFile, snippetNode,
  type StorageAdapter, type TextSession, type TransformController,
} from '@adapters/index';

/** KG 공통 CSS·자산이 서비스되는 위치. index.html 의 <link> 와 같아야 한다. */
export const KG_BASE = '/kg/';
/** 복제·붙여넣기로 생긴 개체를 원본에서 얼마나 비켜 놓을지(px) */
const PASTE_OFFSET = 16;

export type Zoom = number | 'fit';
export type Status = { message: string; error?: boolean };

export interface EditorApi {
  readonly store: Store;
  attachCanvas(stage: HTMLElement, paper: HTMLElement): () => void;

  /* 문서 */
  open(doc: SlideDoc): void;
  importFromUrl(url: string): Promise<void>;
  importFile(file: File): Promise<void>;
  save(): Promise<void>;
  list(): Promise<SlideMeta[]>;
  loadSaved(id: string): Promise<void>;
  exportHtml(): void;
  exportJson(): void;
  setTitle(title: string): void;

  /* 원시 통로 — 패널의 수치 입력처럼 커맨드를 그대로 보내야 할 때만 쓴다 */
  run(cmd: Command): void;
  runAll(cmds: Command[]): void;
  undo(): void;
  redo(): void;

  /* 선택 */
  selection(): NodeId[];
  select(ids: NodeId[]): void;
  selectAll(): void;
  clearSelection(): void;
  onSelection(fn: (ids: NodeId[]) => void): () => void;

  /* 글자 */
  editSelectedText(): void;

  /* 서식 */
  styleSelected(style: StylePatch): void;
  clearStyleSelected(): void;
  copyFormat(): void;
  pasteFormat(scope?: FormatScope): void;

  /* 존재 */
  removeSelected(): void;
  restore(ids: NodeId[]): void;
  removedList(): NodeId[];
  insert(kind: keyof typeof SNIPPETS): void;
  duplicate(ids?: NodeId[]): NodeId[];
  copySelected(): void;
  cutSelected(): void;
  paste(): void;
  groupSelected(): void;
  ungroupSelected(): void;
  lockSelected(locked: boolean): void;

  /* 배치 */
  detachSelected(): void;
  reflowSelected(): void;
  alignSelected(edge: ObjectAlign): void;
  distributeSelected(axis: Distribute): void;
  orderSelected(op: 'front' | 'back' | 'forward' | 'backward'): void;
  nudgeSelected(dx: number, dy: number): void;

  /* 위계 전역값 */
  setRoleStyle(role: Role, style: RoleStyle | null): void;
  setThemeScale(scale: number): void;
  resetTheme(): void;

  /* 검사 */
  audit(): OverflowIssue[];
  fixOverflow(ids?: NodeId[]): void;

  /* 보기 */
  zoom(): Zoom;
  setZoom(z: Zoom): void;

  tokens(): KgToken[];
  onStatus(fn: (s: Status) => void): () => void;
  onChange(fn: () => void): () => void;
}

const BLANK_HTML = '<section class="kg-slide kg-root"><div class="kg-body-area"></div></section>';

export function blankDoc(): SlideDoc {
  return createSlideDoc({
    id: crypto.randomUUID(),
    title: '',
    now: new Date().toISOString(),
    source: { kind: 'kg-html', html: BLANK_HTML, css: '' },
  });
}

export function createEditor(storage: StorageAdapter = localAdapter): EditorApi {
  const store = createStore(blankDoc());

  let paper: HTMLElement | null = null;
  let stageEl: HTMLElement | null = null;
  let root: HTMLElement | null = null;
  let transform: TransformController | null = null;
  let session: TextSession | null = null;
  let slideStyle: HTMLStyleElement | null = null;
  let themeStyle: HTMLStyleElement | null = null;
  let zoom: Zoom = 'fit';
  let tokenCache: KgToken[] = [];

  const selectionListeners = new Set<(ids: NodeId[]) => void>();
  const statusListeners = new Set<(s: Status) => void>();
  const status = (message: string, error = false) =>
    statusListeners.forEach((f) => f({ message, error }));

  void loadKgTokens(`${KG_BASE}colors_and_type.css`).then((t) => { tokenCache = t; }).catch(() => undefined);

  /* ---------- 캔버스 ---------- */

  function draw() {
    if (!paper) return;
    const doc = store.get();
    ({ root } = render(paper, doc));
    styleTag('slide').textContent = doc.source.css;
    styleTag('theme').textContent = themeCss(doc.theme);
    transform?.refresh();
  }

  function styleTag(kind: 'slide' | 'theme'): HTMLStyleElement {
    const ref = kind === 'slide' ? slideStyle : themeStyle;
    if (ref) return ref;
    const tag = document.createElement('style');
    tag.dataset['kg'] = kind;
    document.head.appendChild(tag);
    if (kind === 'slide') slideStyle = tag; else themeStyle = tag;
    return tag;
  }

  function applyScale() {
    if (!paper) return;
    const stage = paper.parentElement;
    const wrap = stage?.parentElement;
    if (!stage || !wrap) return;
    const { w, h } = store.get().canvas;
    const gutter = 2 * parseFloat(getComputedStyle(wrap).paddingLeft || '0');
    const s = zoom === 'fit'
      ? Math.min((wrap.clientWidth - gutter) / w, (wrap.clientHeight - gutter) / h, 1)
      : zoom;
    stage.style.setProperty('--ed-scale', String(Math.max(0.1, s)));
    stage.style.setProperty('--ed-slide-w', `${w}px`);
    stage.style.setProperty('--ed-slide-h', `${h}px`);
  }

  const scale = () => (stageEl ? parseFloat(getComputedStyle(stageEl).getPropertyValue('--ed-scale')) || 1 : 1);

  function openTextEditor(el: HTMLElement | null) {
    const id = el?.getAttribute('data-kg-id');
    if (!el || !id) return;
    session?.commit();
    session = editText(el, {
      onCommit: (html) => {
        session = null;
        store.dispatch({ type: 'setText', id, html }, { coalesce: `text:${id}` });
      },
      onCancel: () => { session = null; },
    });
  }

  /** 선택 대상 — 항상 그룹 단위로 넓히고, 잠긴 것과 지워진 것을 걷어낸다. */
  const targets = (): NodeId[] => editable(store.get(), api.selection());

  function elementOf(id: NodeId): HTMLElement | null {
    return root ? byId(root, id) : null;
  }

  /** 복제·삽입 위치. 선택이 있으면 그 옆, 없으면 캔버스 가운데. */
  function placeRect(w: number, h: number): { x: number; y: number; w: number; h: number } {
    const { w: cw, h: ch } = store.get().canvas;
    return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w, h };
  }

  function insertCommands(nodes: AddedNode[], rects: { x: number; y: number; w: number; h: number }[]): { cmds: Command[]; ids: NodeId[] } {
    const cmds: Command[] = [];
    const ids: NodeId[] = [];
    nodes.forEach((node, i) => {
      const id = newNodeId();
      ids.push(id);
      cmds.push({ type: 'insert', id, node, rect: rects[i] ?? placeRect(240, 80) });
    });
    return { cmds, ids };
  }

  /* ---------- 공개 API ---------- */

  const api: EditorApi = {
    store,

    attachCanvas(stage, el) {
      paper = el;
      stageEl = stage;
      transform = createTransform({
        stage,
        getRoot: () => root,
        getScale: scale,
        store,
        onSelectionChange: (ids) => selectionListeners.forEach((f) => f(ids)),
        duplicate: (ids) => api.duplicate(ids),
      });

      const onDouble = (e: MouseEvent) =>
        openTextEditor((e.target as Element | null)?.closest<HTMLElement>('[data-kg-text]') ?? null);
      el.addEventListener('dblclick', onDouble);

      // 캔버스는 스토어 변경에 동기로 반응한다. React 렌더 주기를 타지 않는다.
      const unsub = store.subscribe(() => { draw(); applyScale(); });
      const ro = new ResizeObserver(() => applyScale());
      if (stage.parentElement) ro.observe(stage.parentElement);

      draw();
      applyScale();

      return () => {
        unsub();
        ro.disconnect();
        el.removeEventListener('dblclick', onDouble);
        transform?.destroy();
        transform = null;
        session?.cancel();
        session = null;
        paper = null;
        stageEl = null;
        root = null;
      };
    },

    open(doc) {
      session?.cancel();
      store.replace(doc);
      draw();
      applyScale();
      transform?.select([]);
      status(`불러옴 — ${doc.title || doc.id}`);
    },

    async importFromUrl(url) {
      try {
        api.open(await importKgHtmlFrom(url, { assetBase: `${KG_BASE}assets/` }));
      } catch (e) { status(msg(e), true); }
    },

    async importFile(file) {
      try {
        if (file.name.endsWith('.json')) api.open(await readDocFile(file));
        else api.open(importKgHtml(await file.text(), { origin: file.name, assetBase: `${KG_BASE}assets/` }));
      } catch (e) { status(msg(e), true); }
    },

    async save() {
      try {
        await storage.save(store.get());
        status('저장함');
      } catch (e) { status(msg(e), true); }
    },

    list: () => storage.list(),

    async loadSaved(id) {
      try { api.open(await storage.load(id)); } catch (e) { status(msg(e), true); }
    },

    exportHtml() {
      const doc = store.get();
      downloadText(`${doc.title || 'slide'}.html`, toStandaloneHtml(doc, { cssBase: KG_BASE }));
      status('HTML 내보냄');
    },

    exportJson() {
      downloadDoc(store.get());
      status('JSON 내보냄');
    },

    setTitle: (title) => store.dispatch({ type: 'setTitle', title }, { coalesce: 'title' }),

    run: (cmd) => store.dispatch(cmd),
    runAll: (cmds) => store.batch(cmds),
    undo: () => { session?.cancel(); store.undo(); },
    redo: () => { session?.cancel(); store.redo(); },

    /* 선택 */
    selection: () => transform?.selection() ?? [],
    select: (ids) => transform?.select(ids),
    selectAll() {
      if (!root) return;
      const doc = store.get();
      const body = byId(root, 'n')?.querySelector('.kg-body-area');
      const ids = listNodes(root)
        .filter((el) => body?.contains(el) || el.closest('.kg-detached-layer'))
        .map((el) => el.getAttribute('data-kg-id')!)
        .filter((id) => !isRemoved(doc, id));
      // 최상위만 고른다 — 자손까지 넣으면 옮길 때 이중으로 움직인다.
      transform?.select(ids.filter((id) => !ids.some((o) => o !== id && id.startsWith(`${o}.`))));
    },
    clearSelection: () => transform?.select([]),
    onSelection(fn) {
      selectionListeners.add(fn);
      return () => selectionListeners.delete(fn);
    },

    /* 글자 */
    editSelectedText() {
      const id = api.selection()[0];
      if (!id) return;
      const el = elementOf(id);
      openTextEditor(el?.matches('[data-kg-text]') ? el : el?.querySelector<HTMLElement>('[data-kg-text]') ?? null);
    },

    /* 서식 */
    styleSelected(style) {
      const ids = targets();
      if (ids.length) store.dispatch({ type: 'setStyle', ids, style });
    },
    clearStyleSelected() {
      const ids = targets();
      if (ids.length) store.dispatch({ type: 'clearStyle', ids });
    },
    copyFormat() {
      const id = api.selection()[0];
      const el = id ? elementOf(id) : null;
      if (!el) return;
      clipboard.putFormat(readFormat(el, tokenCache));
      status('서식 복사함');
    },
    pasteFormat(scope = 'all') {
      const style = clipboard.takeFormat();
      const ids = targets();
      if (!style || ids.length === 0) return;
      store.dispatch({ type: 'applyFormat', ids, style: scopeFormat(style, scope) });
      status('서식 붙여넣음');
    },

    /* 존재 */
    removeSelected() {
      const ids = targets();
      if (ids.length === 0) return;
      store.dispatch({ type: 'remove', ids });
      transform?.select([]);
      status(`${ids.length}개 삭제함 — 되돌리기로 복구 가능`);
    },
    restore(ids) {
      if (ids.length) store.dispatch({ type: 'restore', ids });
    },
    removedList: () => store.get().tree.removed,

    insert(kind) {
      const spec = SNIPPETS[kind];
      const { cmds, ids } = insertCommands([snippetNode(kind)], [placeRect(spec.size.w, spec.size.h)]);
      store.batch(cmds);
      transform?.select(ids);
      status(`${spec.label} 추가함`);
    },

    duplicate(explicit) {
      const ids = explicit ? editable(store.get(), expandSelection(store.get(), explicit)) : targets();
      if (!root || ids.length === 0) return [];
      const nodes: AddedNode[] = [];
      const rects: { x: number; y: number; w: number; h: number }[] = [];
      for (const id of ids) {
        const el = elementOf(id);
        if (!el) continue;
        nodes.push(cloneNodeSnapshot(el, id));
        const r = canvasRect(root, el, scale());
        rects.push({ ...r, x: r.x + PASTE_OFFSET, y: r.y + PASTE_OFFSET });
      }
      if (nodes.length === 0) return [];
      const { cmds, ids: newIds } = insertCommands(nodes, rects);
      store.batch(cmds);
      transform?.select(newIds);
      return newIds;
    },

    copySelected() {
      const ids = targets();
      if (!root || ids.length === 0) return;
      const nodes = ids.map((id) => elementOf(id)).filter((el): el is HTMLElement => !!el)
        .map((el, i) => cloneNodeSnapshot(el, ids[i]!));
      clipboard.putNodes(nodes);
      status(`${nodes.length}개 복사함`);
    },

    cutSelected() {
      api.copySelected();
      api.removeSelected();
    },

    paste() {
      const nodes = clipboard.takeNodes();
      if (nodes.length === 0) return;
      const rects = nodes.map((_, i) => {
        const base = placeRect(240, 80);
        return { ...base, x: base.x + i * PASTE_OFFSET, y: base.y + i * PASTE_OFFSET };
      });
      const { cmds, ids } = insertCommands(nodes, rects);
      store.batch(cmds);
      transform?.select(ids);
      status(`${nodes.length}개 붙여넣음`);
    },

    groupSelected() {
      const ids = targets();
      if (ids.length < 2) return;
      store.dispatch({ type: 'group', groupId: newGroupId(), ids });
      status(`${ids.length}개 그룹으로 묶음`);
    },

    ungroupSelected() {
      const doc = store.get();
      const gids = [...new Set(api.selection().map((id) => groupOf(doc, id)).filter((g): g is string => !!g))];
      if (gids.length) store.dispatch({ type: 'ungroup', groupIds: gids });
    },

    lockSelected(locked) {
      const ids = api.selection();
      if (ids.length) store.dispatch({ type: 'setLocked', ids, locked });
    },

    /* 배치 */
    detachSelected() {
      if (!root) return;
      const s = scale();
      const cmds: Command[] = [];
      for (const id of targets()) {
        if (store.get().patches[id]?.layout?.mode === 'detached') continue;
        const el = elementOf(id);
        if (el) cmds.push({ type: 'detach', id, rect: canvasRect(root, el, s) });
      }
      if (cmds.length) store.batch(cmds);
    },
    reflowSelected() {
      const ids = targets();
      if (ids.length) store.dispatch({ type: 'reflow', ids });
    },
    alignSelected(edge) {
      const ids = targets();
      if (ids.length > 1) store.dispatch({ type: 'alignObjects', ids, edge });
    },
    distributeSelected(axis) {
      const ids = targets();
      if (ids.length > 2) store.dispatch({ type: 'distribute', ids, axis });
    },
    orderSelected(op) {
      const ids = targets();
      if (ids.length) store.dispatch({ type: 'order', ids, op });
    },
    nudgeSelected(dx, dy) {
      const ids = targets();
      if (ids.length) store.dispatch({ type: 'nudge', ids, dx, dy }, { coalesce: `nudge:${ids.join()}` });
    },

    /* 위계 */
    setRoleStyle: (role, style) => store.dispatch({ type: 'setRoleStyle', role, style }),
    setThemeScale: (s) => store.dispatch({ type: 'setThemeScale', scale: s }, { coalesce: 'scale' }),
    resetTheme: () => store.dispatch({ type: 'resetTheme' }),

    /* 검사 */
    audit: () => (root ? auditOverflow(root) : []),
    fixOverflow(ids) {
      if (!root) return;
      const issues = auditOverflow(root).filter((i) => i.kind === 'clipped' && (!ids || ids.includes(i.id)));
      const cmds: Command[] = [];
      const unresolved: string[] = [];
      for (const issue of issues) {
        const el = elementOf(issue.id);
        if (!el) continue;
        const size = fitFontSize(el);
        if (size) cmds.push({ type: 'setStyle', ids: [issue.id], style: { fontSize: size } });
        else unresolved.push(issue.id);
      }
      if (cmds.length) store.batch(cmds);
      status(
        unresolved.length
          ? `${cmds.length}개 보정, ${unresolved.length}개는 글자 축소로 해결 불가 — 박스 크기나 내용 조정 필요`
          : `${cmds.length}개 보정함`,
        unresolved.length > 0,
      );
    },

    /* 보기 */
    zoom: () => zoom,
    setZoom(z) { zoom = z; applyScale(); transform?.refresh(); },

    tokens: () => tokenCache,

    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    onChange: (fn) => store.subscribe(fn),
  };

  return api;
}

export { KG_CANVAS };

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
