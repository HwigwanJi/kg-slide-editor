/**
 * 편집기 컨트롤러 — 코어·어댑터·DOM을 잇는 배선층.
 *
 * React는 이 객체를 구독만 한다. 장표 DOM은 여기가 소유한다.
 * (React가 장표를 다시 그리려 들면 KG 마크업과 싸우게 되므로 경계를 여기서 자른다)
 *
 * 화면 조각(툴바·패널)은 이 파일이 노출한 동작만 부른다. store.patches 를 직접 만지지 않는다.
 */
import {
  KG_CANVAS, createSlideDoc, loadKgTokens,
  type KgToken, type NodeId, type ObjectAlign, type SlideDoc, type SlideMeta, type StylePatch,
} from '@contract/index';
import {
  byId, canvasRect, createStore, render, toStandaloneHtml,
  type Command, type Store,
} from '@core/index';
import {
  createTransform, downloadDoc, downloadText, editText, importKgHtml, importKgHtmlFrom,
  localAdapter, readDocFile,
  type StorageAdapter, type TextSession, type TransformController,
} from '@adapters/index';

/** KG 공통 CSS·자산이 서비스되는 위치. index.html 의 <link> 와 같아야 한다. */
export const KG_BASE = '/kg/';

export type Zoom = number | 'fit';

export interface EditorApi {
  readonly store: Store;
  /** 캔버스 DOM 연결. 정리 함수를 돌려준다. */
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

  /* 편집 — 선택 대상에 대한 동작. 화면 조각은 이 이름만 부른다. */
  run(cmd: Command): void;
  runAll(cmds: Command[]): void;
  undo(): void;
  redo(): void;
  styleSelected(style: StylePatch): void;
  detachSelected(): void;
  reflowSelected(): void;
  alignSelected(edge: ObjectAlign): void;
  orderSelected(op: 'front' | 'back' | 'forward' | 'backward'): void;
  hideSelected(hidden: boolean): void;

  /* 선택 */
  selection(): NodeId[];
  select(ids: NodeId[]): void;
  onSelection(fn: (ids: NodeId[]) => void): () => void;

  /* 보기 */
  zoom(): Zoom;
  setZoom(z: Zoom): void;

  /* 브랜드 토큰 */
  tokens(): Promise<KgToken[]>;

  /* 상태 알림 */
  onStatus(fn: (s: { message: string; error?: boolean }) => void): () => void;
}

const BLANK_HTML =
  '<section class="kg-slide kg-root"><div class="kg-body-area"></div></section>';

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
  let styleTag: HTMLStyleElement | null = null;
  let zoom: Zoom = 'fit';

  const selectionListeners = new Set<(ids: NodeId[]) => void>();
  const statusListeners = new Set<(s: { message: string; error?: boolean }) => void>();
  const status = (message: string, error = false) =>
    statusListeners.forEach((f) => f({ message, error }));

  /* ---------- 캔버스 ---------- */

  function draw() {
    if (!paper) return;
    const doc = store.get();
    ({ root } = render(paper, doc));
    ensureSlideCss(doc);
    transform?.refresh();
  }

  /** 장표 전용 <style> 은 문서에 딸려 오므로 문서가 바뀔 때마다 갈아 끼운다. */
  function ensureSlideCss(doc: SlideDoc) {
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.dataset['kgSlideCss'] = '';
      document.head.appendChild(styleTag);
    }
    if (styleTag.textContent !== doc.source.css) styleTag.textContent = doc.source.css;
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

  function currentScale(stage: HTMLElement): number {
    return parseFloat(getComputedStyle(stage).getPropertyValue('--ed-scale')) || 1;
  }

  function openTextEditor(target: EventTarget | null) {
    if (!root) return;
    const el = (target as Element | null)?.closest<HTMLElement>('[data-kg-text]');
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

  /* ---------- 공개 API ---------- */

  const api: EditorApi = {
    store,

    attachCanvas(stage, el) {
      paper = el;
      stageEl = stage;
      transform = createTransform({
        stage,
        getRoot: () => root,
        getScale: () => currentScale(stage),
        store,
        onSelectionChange: (ids) => selectionListeners.forEach((f) => f(ids)),
      });

      const onDouble = (e: MouseEvent) => openTextEditor(e.target);
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
      } catch (e) {
        status(msg(e), true);
      }
    },

    async importFile(file) {
      try {
        if (file.name.endsWith('.json')) api.open(await readDocFile(file));
        else api.open(importKgHtml(await file.text(), {
          origin: file.name, assetBase: `${KG_BASE}assets/`,
        }));
      } catch (e) {
        status(msg(e), true);
      }
    },

    async save() {
      try {
        await storage.save(store.get());
        status('저장함');
      } catch (e) {
        status(msg(e), true);
      }
    },

    list: () => storage.list(),

    async loadSaved(id) {
      try {
        api.open(await storage.load(id));
      } catch (e) {
        status(msg(e), true);
      }
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

    run: (cmd) => store.dispatch(cmd),
    runAll: (cmds) => store.batch(cmds),
    undo: () => store.undo(),
    redo: () => store.redo(),

    styleSelected(style) {
      store.batch(api.selection().map((id) => ({ type: 'setStyle' as const, id, style })));
    },

    detachSelected() {
      if (!root || !stageEl) return;
      const scale = currentScale(stageEl);
      const cmds: Command[] = [];
      for (const id of api.selection()) {
        if (store.get().patches[id]?.layout?.mode === 'detached') continue;
        const el = byId(root, id);
        if (el) cmds.push({ type: 'detach', id, rect: canvasRect(root, el, scale) });
      }
      if (cmds.length) store.batch(cmds);
    },

    reflowSelected() {
      store.batch(api.selection().map((id) => ({ type: 'reflow' as const, id })));
    },

    alignSelected(edge) {
      const ids = api.selection();
      if (ids.length > 1) store.dispatch({ type: 'alignObjects', ids, edge });
    },

    orderSelected(op) {
      store.batch(api.selection().map((id) => ({ type: 'order' as const, id, op })));
    },

    hideSelected(hidden) {
      store.batch(api.selection().map((id) => ({ type: 'setHidden' as const, id, hidden })));
    },

    selection: () => transform?.selection() ?? [],
    select: (ids) => transform?.select(ids),
    onSelection(fn) {
      selectionListeners.add(fn);
      return () => selectionListeners.delete(fn);
    },

    zoom: () => zoom,
    setZoom(z) { zoom = z; applyScale(); transform?.refresh(); },

    tokens: () => loadKgTokens(`${KG_BASE}colors_and_type.css`),

    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
  };

  return api;
}

export { KG_CANVAS };

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
