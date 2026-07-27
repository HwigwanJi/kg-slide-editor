/**
 * 편집기 컨트롤러 — 코어·어댑터·DOM을 잇는 배선층.
 *
 * 문서가 둘이다. 덱(프로젝트의 순서·목차)과 지금 열려 있는 장표.
 * 둘 다 같은 스토어 구현을 쓰고 각자 실행취소 이력을 갖는다.
 * 덱은 장표 내용을 절대 담지 않는다(docs/DECISIONS.md D1).
 *
 * React는 이 객체를 구독만 한다. 장표 DOM은 여기가 소유한다.
 * 화면 조각은 이 파일이 노출한 동작만 부른다. 새 식별자·좌표·마크업은 여기서 만들어 커맨드에 넣는다.
 */
import {
  DEFAULT_SETTINGS, KG_CANVAS, ROLE_ATTR, SETTINGS_FILE, createSlideDoc, loadKgTokens,
  newGroupId, newNodeId,
  type AddedNode, type Anchor, type DeckDoc, type DeckEntry, type Distribute, type KgToken,
  floorFor,
  type NodeId, type ObjectAlign, type ProjectSettings, type Role, type RoleStyle,
  type SlideDoc, type StylePatch,
} from '@contract/index';
import {
  auditOverflow, byId, canvasRect, createDeckStore, createSlideStore, editable, expandSelection,
  buildReference, fitFontSize, fixOptions, groupOf, listNodes, isRemoved, neighborsOf,
  readFormat, render, roleOf,
  scopeFormat, placeByOrigin, slideNumber, themeCss, toStandaloneHtml,
  type Command, type DeckStore, type FixOption, type FormatScope, type Neighbor,
  type OverflowIssue, type SlideStore,
} from '@core/index';
import {
  SNIPPETS, clipboard, cloneNodeSnapshot, createTransform, downloadDoc, downloadText,
  DEFAULT_PROJECT_NAME, editText, formatProbe, grantRecalledFolder, importKgHtml, importKgHtmlFrom,
  localProject, pickProjectFolder, probeFolderAccess, readDocFile, recallProjectFolder,
  snippetNode,
  type MarqueeMode, type ProjectAdapter, type TextSession, type TransformController,
} from '@adapters/index';

/** KG 공통 CSS·자산이 서비스되는 위치. index.html 의 <link> 와 같아야 한다. */
export const KG_BASE = '/kg/';
/** 복제·붙여넣기로 생긴 개체를 원본에서 얼마나 비켜 놓을지(px) */
const PASTE_OFFSET = 16;

export type Zoom = number | 'fit';
export type Status = { message: string; error?: boolean };

/**
 * 오래 걸리는 일이 진행 중임을 알린다.
 * 저장·프로젝트 전환처럼 도중에 문서를 만지면 어긋나는 작업은 화면을 막아야 한다.
 */
export interface Busy { active: boolean; message: string }

/** 아래 가운데에 잠깐 떴다 사라지는 알림. 결과를 놓치지 않게 한다. */
export interface Toast { id: number; kind: 'ok' | 'error' | 'info'; message: string }

export interface EditorApi {
  readonly slides: SlideStore;
  readonly deck: DeckStore;
  /** host 는 여백까지 포함한 캔버스 영역, stage 는 장표 크기의 기준 상자다. */
  attachCanvas(host: HTMLElement, stage: HTMLElement, paper: HTMLElement): () => void;

  /* 프로젝트 */
  projectName(): string;
  openFolder(): Promise<void>;
  /**
   * 지금 프로젝트를 폴더에 옮겨 담고 그 폴더로 전환한다.
   * 기본 프로젝트(브라우저 저장소)는 명령줄에서 볼 수 없다. 이 통로로 파일이 된다.
   */
  saveToFolder(): Promise<void>;
  /** 저장하지 않은 편집이 있는가. */
  isDirty(): boolean;
  /** 디스크가 메모리보다 새로운가 — 다시 읽어야 하는 상태. */
  needsReload(): boolean;
  /** 위 두 값이 바뀌면 알린다. */
  onProjectState(fn: () => void): () => void;
  /** 지난번 폴더가 남아 있는가. 권한만 받으면 바로 이을 수 있다. */
  hasPendingFolder(): boolean;
  /** 그 폴더의 권한을 받아 잇는다. 사람이 누른 직후에만 통한다. */
  resumeFolder(): Promise<void>;
  /**
   * 폴더에 쓸 수 있는지 실제 저장과 같은 순서로 밟아 본다.
   * 결과를 클립보드에 담는다 — 그대로 붙여 넣으면 어디서 막혔는지 알 수 있다.
   */
  diagnoseFolder(): Promise<void>;
  /**
   * 디스크의 프로젝트를 다시 읽는다. 명령줄 도구가 폴더에 쓴 결과를 화면으로 가져오는 통로다.
   * announce 는 사람이 눌렀을 때만 켠다 — 화면이 붙을 때마다 알림이 뜨면 안 된다.
   */
  reloadProject(announce?: boolean): Promise<void>;
  setProjectName(name: string): void;
  /** kg.config.json 에서 읽은 값. 최소 글자 크기 같은 판단 기준이 여기서 온다. */
  settings(): ProjectSettings;
  updateSettings(patch: Partial<ProjectSettings>): Promise<void>;

  /* 덱 */
  currentSlideId(): string;
  currentNumber(): number;
  openSlide(id: string): Promise<void>;
  newSlide(): Promise<void>;
  addFromHtmlUrl(url: string): Promise<void>;
  /** HTML·kgslide 를 프로젝트에 적재한다. 이름순으로 들어가고, 같은 이름은 그 자리를 갈아 끼운다. */
  importFiles(files: File[]): Promise<void>;
  duplicateSlide(id?: string): Promise<void>;
  deleteSlides(ids: string[]): Promise<void>;
  reorderSlides(ids: string[]): void;
  moveSlide(id: string, to: number): void;

  /* 저장·내보내기 */
  save(): Promise<void>;
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

  /** 화면에 실제로 걸린 위계(자동 추론 결과 포함) */
  roleOfNode(id: NodeId): Role | null;
  /** 위계별 요소 수 — 조정이 어디에 닿는지 보여 준다 */
  roleCounts(): Record<string, number>;
  /** 위계별로 화면에 실제 걸린 값. 설정 칸이 비어 있어도 지금 값을 보여 주기 위한 것. */
  roleMetrics(): Record<string, { fontSize: number; fontWeight: number; color: string }>;

  /** 지금 선택 옆에 있는 것들 — 캔버스에서 집기 어려운 요소를 목록으로 잡는다 */
  neighbors(): Neighbor[];
  /** 선택한 도형이 쓰는 CSS 변수 목록. 색을 갈아 끼울 자리를 보여 주기 위한 것. */
  shapeVars(): string[];
  /** 고정점을 붙박은 채 확대·축소 */
  scaleSelected(factor: number, anchor: Anchor): void;
  /** 빈 곳을 끌어 여러 개를 고를 때의 판정 방식 */
  marqueeMode(): MarqueeMode;
  setMarqueeMode(mode: MarqueeMode): void;
  /**
   * 지금 고른 것을 가리키는 쪽지를 클립보드에 담는다.
   * 채팅창에 붙여 넣으면 AI 가 어느 장표의 어느 노드인지 정확히 안다.
   */
  copyReference(): Promise<void>;
  /**
   * 선택 요소 '안에 있는 글자 전체'의 크기를 배율로 조정한다.
   *
   * 박스에 font-size 를 걸어도 자식이 자기 크기를 명시하고 있으면 상속되지 않는다.
   * 그래서 안쪽 글자를 하나하나 훑어 각각에 값을 넣는다.
   * growBox 를 켜면 박스도 함께 키운다(자동 배치면 먼저 떼어낸다).
   */
  scaleTextInside(factor: number, growBox: boolean): void;

  /* 검사 */
  audit(): OverflowIssue[];
  /** 덱 전체 검사. 열려 있지 않은 장표는 화면 밖에서 그려 잰다. */
  auditDeck(): Promise<OverflowIssue[]>;
  /** 그 항목이 있는 장표로 이동해 선택한다. 맞춤법 검사의 '다음'과 같은 동작. */
  focusIssue(issue: OverflowIssue): Promise<void>;
  /** 이 요소의 넘침을 푸는 방법들 */
  fixOptions(id: NodeId): FixOption[];
  applyFix(id: NodeId, option: FixOption): void;
  fixOverflow(ids?: NodeId[]): void;

  /* 보기 */
  zoom(): Zoom;
  setZoom(z: Zoom): void;

  tokens(): KgToken[];
  onStatus(fn: (s: Status) => void): () => void;
  /** 진행 중 표시. 켜져 있는 동안 화면을 막는다. */
  onBusy(fn: (b: Busy) => void): () => void;
  /** 결과 알림 */
  onToast(fn: (t: Toast) => void): () => void;
}

const BLANK_HTML = '<section class="kg-slide kg-root"><div class="kg-body-area"></div></section>';

export function blankDoc(title = ''): SlideDoc {
  return createSlideDoc({
    id: crypto.randomUUID(),
    title,
    now: new Date().toISOString(),
    source: { kind: 'kg-html', html: BLANK_HTML, css: '' },
  });
}

// origin(어느 파일에서 왔는지)을 빠뜨리면 같은 장표를 다시 적재할 때 짝을 찾지 못해
// 자리를 잃고 사본이 하나 더 생긴다. 도구(tools/ingest.mjs)는 이 값을 쓴다.
const entryOf = (doc: SlideDoc): DeckEntry => ({
  id: doc.id,
  title: doc.title,
  updatedAt: doc.updatedAt,
  ...(doc.source.origin ? { origin: doc.source.origin } : {}),
});

export function createEditor(initial: ProjectAdapter = localProject): EditorApi {
  let project = initial;
  const slides = createSlideStore(blankDoc());
  const deck = createDeckStore(emptyDeck());

  let paper: HTMLElement | null = null;
  let stageEl: HTMLElement | null = null;
  let root: HTMLElement | null = null;
  let transform: TransformController | null = null;
  let session: TextSession | null = null;
  let slideStyle: HTMLStyleElement | null = null;
  let themeStyle: HTMLStyleElement | null = null;
  /** 지금 캔버스에 그려져 있는 쪽번호 상태("자리/전체"). 다시 그릴지 판단하는 기준. */
  let drawnPage = '';
  let zoom: Zoom = 'fit';
  let tokenCache: KgToken[] = [];
  let settings: ProjectSettings = DEFAULT_SETTINGS;

  /** 지난번 폴더가 남아 있는데 권한만 못 받은 상태. 단추 하나로 이을 수 있다. */
  let pendingFolder = false;

  /**
   * 디스크가 메모리보다 새로운가. 다시 읽기를 눌러야 하는 상태다.
   * 저절로 반영하지 않으므로 이 표시가 유일한 신호다.
   */
  let stale = false;
  /** 마지막으로 확인한 디스크 파일 시각. 다시 읽으면 여기서 기준을 새로 잡는다. */
  let seen: { deck: number; slide: number } | null = null;
  /** 마지막으로 저장한 시점의 문서 시각. 이것과 지금이 다르면 저장하지 않은 편집이 있다. */
  let savedAt = '';
  const stateListeners = new Set<() => void>();
  const notifyState = () => stateListeners.forEach((f) => f());

  const selectionListeners = new Set<(ids: NodeId[]) => void>();
  const statusListeners = new Set<(s: Status) => void>();
  const busyListeners = new Set<(b: Busy) => void>();
  const toastListeners = new Set<(t: Toast) => void>();
  let toastSeq = 0;

  const status = (message: string, error = false) =>
    statusListeners.forEach((f) => f({ message, error }));
  const toast = (kind: Toast['kind'], message: string) =>
    toastListeners.forEach((f) => f({ id: ++toastSeq, kind, message }));

  /**
   * 오래 걸리는 작업을 감싼다.
   * 진행 중에는 화면을 막고, 끝나면 결과를 알린다.
   * 중첩 호출은 바깥 것만 표시가 유지되도록 깊이를 센다.
   */
  let busyDepth = 0;
  async function withBusy<T>(message: string, done: string, run: () => Promise<T>): Promise<T | undefined> {
    busyDepth++;
    busyListeners.forEach((f) => f({ active: true, message }));
    try {
      const result = await run();
      if (done) toast('ok', done);
      return result;
    } catch (e) {
      status(msg(e), true);
      toast('error', msg(e));
      return undefined;
    } finally {
      busyDepth--;
      if (busyDepth === 0) busyListeners.forEach((f) => f({ active: false, message: '' }));
    }
  }

  void loadKgTokens(`${KG_BASE}colors_and_type.css`).then((t) => { tokenCache = t; }).catch(() => undefined);

  /* ---------- 캔버스 ---------- */

  function draw() {
    if (!paper) return;
    const doc = slides.get();
    styleTag('slide').textContent = doc.source.css;

    // 위계 추론이 KG 원본 서식만 보도록 전역 위계 규칙을 잠시 끈다.
    // 켜 둔 채로 재면 "굵게 바꿨더니 위계가 바뀌고 다시 굵어지는" 순환이 생긴다.
    const theme = styleTag('theme');
    theme.disabled = true;
    try {
      ({ root } = render(paper, doc, { page: slideNumber(deck.get(), doc.id) || undefined, total: deck.get().slides.length || undefined }));
    } finally {
      theme.textContent = themeCss(doc.theme);
      theme.disabled = false;
    }
    drawnPage = pageStamp();
    transform?.refresh();
  }

  /**
   * 쪽번호에 영향을 주는 값 — 이 장표의 자리와 전체 장수.
   * 덱은 이름·미리보기 같은 것도 담고 있어, 바뀌었다고 매번 다시 그리면
   * 이름을 한 글자 칠 때마다 캔버스가 재생성되고 편집 중인 글자가 끊긴다.
   *
   * 비교 기준은 반드시 `drawnPage`(마지막으로 그린 값)여야 한다.
   * 덱 구독자 안에서만 기억해 두면, 장표를 바꿀 때 덱이 아니라 장표 쪽이 바뀌므로
   * 기억한 값이 낡아 "바뀌었는데 같아 보이는" 자리가 생긴다.
   */
  function pageStamp(): string {
    const d = deck.get();
    return `${slideNumber(d, slides.get().id)}/${d.slides.length}`;
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
    const { w, h } = slides.get().canvas;
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
        slides.dispatch({ type: 'setText', id, html }, { coalesce: `text:${id}` });
      },
      onCancel: () => { session = null; },
    });
  }

  /** 선택 대상 — 항상 그룹 단위로 넓히고, 잠긴 것과 지워진 것을 걷어낸다. */
  const targets = (): NodeId[] => editable(slides.get(), api.selection());

  const elementOf = (id: NodeId): HTMLElement | null => (root ? byId(root, id) : null);

  function placeRect(w: number, h: number) {
    const { w: cw, h: ch } = slides.get().canvas;
    return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w, h };
  }

  function insertCommands(nodes: AddedNode[], rects: { x: number; y: number; w: number; h: number }[]) {
    const cmds: Command[] = [];
    const ids: NodeId[] = [];
    nodes.forEach((node, i) => {
      const id = newNodeId();
      ids.push(id);
      cmds.push({ type: 'insert', id, node, rect: rects[i] ?? placeRect(240, 80) });
    });
    return { cmds, ids };
  }

  /* ---------- 덱 ---------- */

  /** 장표를 열기 전에 지금 것을 저장한다. 프로젝트 전환에서 작업분이 사라지지 않게. */
  async function persistCurrent(): Promise<void> {
    const doc = slides.get();
    if (!deck.get().slides.some((s) => s.id === doc.id)) return;
    await project.saveSlide(doc);
    deck.dispatch({ type: 'touchSlide', id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
    await project.saveDeck(deck.get());
  }

  function showSlide(doc: SlideDoc) {
    session?.cancel();
    slides.replace(doc);
    draw();
    applyScale();
    transform?.select([]);
  }

  /** 장표를 덱에 넣고 화면에 띄운다. */
  async function adoptSlide(doc: SlideDoc, at?: number): Promise<void> {
    await persistCurrent();

    // 같은 원본에서 온 장표가 이미 있으면 그 자리를 갱신한다. 사본을 만들지 않는다(D5).
    // 이 규칙이 여기 없어서 "발주기관 이해 (사본)" 이 생겼다.
    const origin = doc.source.origin;
    const twin = origin ? deck.get().slides.find((s) => s.origin === origin) : undefined;
    const target = twin ? { ...doc, id: twin.id } : doc;
    const where = twin ? deck.get().slides.findIndex((s) => s.id === twin.id) : at;

    await project.saveSlide(target);
    deck.dispatch({ type: 'addSlide', entry: entryOf(target), ...(where !== undefined && where >= 0 ? { at: where } : {}) });
    await project.saveDeck(deck.get());
    showSlide(target);
  }

  /* ---------- 공개 API ---------- */

  const api: EditorApi = {
    slides,
    deck,

    attachCanvas(host, stage, el) {
      paper = el;
      stageEl = stage;
      transform = createTransform({
        host,
        stage,
        getRoot: () => root,
        getScale: scale,
        store: slides,
        onSelectionChange: (ids) => selectionListeners.forEach((f) => f(ids)),
        duplicate: (ids) => api.duplicate(ids),
      });

      const onDouble = (e: MouseEvent) =>
        openTextEditor((e.target as Element | null)?.closest<HTMLElement>('[data-kg-text]') ?? null);
      el.addEventListener('dblclick', onDouble);

      // 캔버스는 스토어 변경에 동기로 반응한다. React 렌더 주기를 타지 않는다.
      const unsub = slides.subscribe(() => {
        // 글자를 고치는 중이면 다시 그리지 않는다. 다시 그리면 그 자리의 DOM 이 갈려
        // 편집 세션이 죽고, 쓰던 도중에 손이 멈춘다(AGENTS R4).
        // 세션이 끝날 때 commit 이 다시 dispatch 하므로 그때 그려진다.
        if (session) { notifyState(); return; }
        draw();
        applyScale();
        notifyState();
      });

      /**
       * 저장하지 않은 편집이 있으면 창을 닫기 전에 묻는다.
       * 편집분은 메모리에만 있다. 새로고침 한 번이면 그대로 사라진다.
       */
      const onLeave = (e: BeforeUnloadEvent) => {
        if (!api.isDirty()) return;
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', onLeave);

      // 꼬리말 쪽번호의 진실은 덱 순서다(deck.slides). 순서나 장수가 바뀌면
      // 캔버스도 따라 그려야 목록의 번호와 장표의 번호가 갈라지지 않는다.
      const unsubDeck = deck.subscribe(() => {
        if (pageStamp() === drawnPage) return;
        draw();
      });

      const ro = new ResizeObserver(() => applyScale());
      if (stage.parentElement) ro.observe(stage.parentElement);

      /**
       * 디스크가 바뀌었는지 지켜본다.
       *
       * 파일 감시자는 아직 쓸 수 없어 바뀐 시각만 확인한다. 내용을 읽지 않으므로 싸다.
       *
       * 열려 있는 장표의 원본이 바뀌었으면 **원본만** 갈아 끼우고 다시 그린다.
       * 오버레이는 메모리 것을 그대로 둔다 — 사람이 쌓은 편집분은 사람 것이다.
       * 목차가 바뀌었으면 알리기만 한다. 목록이 통째로 갈리면 무엇이 사라졌는지 알 수 없다.
       *
       * 글자를 편집하는 동안에는 손대지 않는다(AGENTS R4).
       */
      const check = async () => {
        if (!project.stamps || session) return;
        const now = await project.stamps(slides.get().id).catch(() => null);
        if (!now) return;
        if (!seen) { seen = now; return; }

        // 저절로 갈아 끼우지 않는다. 편집하던 중에 화면이 바뀌면 무엇이 사라졌는지 알 수 없다.
        // 바뀌었다는 사실만 세워 두고, 반영은 사람이 "다시 읽기" 를 누를 때 한다.
        if (now.slide !== seen.slide || now.deck !== seen.deck) {
          seen = now;
          if (!stale) {
            stale = true;
            notifyState();
            toast('info', '디스크가 바뀌었습니다 — 다시 읽기를 누르세요');
          }
        }
      };

      const onFocus = () => { void check(); };
      window.addEventListener('focus', onFocus);
      const timer = window.setInterval(() => { void check(); }, 2000);

      draw();
      applyScale();
      // 새로고침 직후에는 아직 브라우저 저장소를 보고 있다. 지난번 폴더가 있으면 그것으로 잇는다.
      void (async () => {
        const back = await recallProjectFolder().catch(() => null);
        if (back && !back.needsPermission) {
          project = back.project;
          await api.reloadProject();
          status(`프로젝트 — ${project.location}`);
          return;
        }
        await api.reloadProject();
        if (back) {
          pendingFolder = true;
          toast('info', '지난 폴더가 있습니다 — "폴더 다시 열기"를 누르세요');
        }
      })();

      return () => {
        unsub();
        unsubDeck();
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('beforeunload', onLeave);
        window.clearInterval(timer);
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

    /* 프로젝트 */
    projectName: () => deck.get().name || project.location,

    async openFolder() {
      const picked = await pickProjectFolder().catch((e) => { status(msg(e), true); return null; });
      if (!picked) return;
      await withBusy('프로젝트를 여는 중', '', async () => {
        await persistCurrent();
        project = picked;
        await api.reloadProject();
        status(`프로젝트 열기 — ${project.location}`);
        toast('ok', `프로젝트 열기 — ${project.location}`);
      });
    },

    /**
     * 디스크의 프로젝트를 다시 읽는다.
     *
     * 명령줄 도구(적재·적용·미리보기)가 폴더에 쓴 결과는 편집기가 알아서 알지 못한다.
     * 감시자를 두지 않았으므로 이 통로가 유일하게 화면을 디스크에 맞추는 길이다.
     *
     * 보던 장표를 그대로 둔다. 첫 장으로 튀면 50장짜리 덱에서 자리를 잃는다.
     * 읽기 전에 지금 장표를 저장한다 — 다시 읽는 김에 편집분이 사라지면 안 된다.
     */
    /**
     * 지금 프로젝트를 통째로 폴더에 옮겨 담는다.
     *
     * 기본 프로젝트는 브라우저 localStorage 에 있다. 파일이 아니므로 Claude Code 도,
     * 다른 브라우저도, 다른 컴퓨터도 그것을 볼 수 없다. 브라우저에서 만든 장표가
     * 명령줄에서 보이지 않는 이유가 이것이다.
     *
     * 폴더로 옮기면 그때부터 양쪽이 같은 파일을 본다. "폴더 열기" 는 폴더를 갈아 끼울 뿐
     * 갖고 있던 장표를 데려가지 않으므로, 옮기는 통로가 따로 있어야 한다.
     */
    isDirty: () => savedAt !== '' && slides.get().updatedAt !== savedAt,
    needsReload: () => stale,
    onProjectState(fn) { stateListeners.add(fn); return () => stateListeners.delete(fn); },

    hasPendingFolder: () => pendingFolder,

    /**
     * 지난번 폴더의 권한만 다시 받는다. 폴더를 찾아 들어가지 않아도 된다.
     * 사람이 누른 직후에만 통하므로 반드시 단추에서 부른다.
     */
    async resumeFolder() {
      const back = await grantRecalledFolder().catch((e) => { status(msg(e), true); return null; });
      if (!back) return;
      await withBusy('프로젝트를 여는 중', '', async () => {
        project = back;
        pendingFolder = false;
        await api.reloadProject();
        toast('ok', `프로젝트 — ${project.location}`);
      });
    },

    async saveToFolder() {
      const picked = await pickProjectFolder().catch((e) => { status(msg(e), true); return null; });
      if (!picked) return;
      await withBusy('폴더로 저장하는 중', '', async () => {
        await persistCurrent();
        const source = project;
        // 브라우저 저장소의 기본 이름을 그대로 들고 가면, 폴더를 열 때마다
        // 남의 프로젝트를 보는 것 같은 이름이 붙는다. 고른 폴더가 곧 이 프로젝트다.
        const named = deck.get();
        if (!named.name || named.name === DEFAULT_PROJECT_NAME) {
          deck.dispatch({ type: 'setName', name: picked.location });
        }
        const d = deck.get();
        for (const entry of d.slides) {
          const doc = entry.id === slides.get().id ? slides.get() : await source.loadSlide(entry.id);
          await picked.saveSlide(doc);
        }
        await picked.saveDeck(d);
        await picked.saveSettings(settings);
        project = picked;
        await api.reloadProject();
        toast('ok', `폴더로 저장 — 장표 ${d.slides.length}장 · ${project.location}`);
      });
    },

    async diagnoseFolder() {
      const report = formatProbe(await probeFolderAccess());
      console.log(report);
      await navigator.clipboard.writeText(report).catch(() => {});
      const failed = report.includes('막힌 자리');
      toast(failed ? 'error' : 'ok', `${failed ? '막힌 자리를 찾았습니다' : '쓰기 가능'} — 진단 결과를 복사했습니다`);
      status(report.split('\n').at(-1) ?? '', failed);
    },

    async reloadProject(announce = false) {
      const read = async () => {
        const before = slides.get().id;
        const had = deck.get().slides.length;
        /*
         * 읽기 전에 저장할지 정한다. 여기가 가장 위험한 갈림길이다.
         *
         * 디스크가 더 새로울 때(stale) 먼저 저장하면, 가져오려던 그 새 내용을 내 것으로 덮는다.
         * 명령줄이 방금 고쳐 놓은 것을 "다시 읽기" 가 지우는 셈이다.
         * 그래서 그때는 저장하지 않는다 — 대신 잃을 것이 있으면 먼저 묻는다.
         *
         * 디스크가 그대로면(단순히 목록을 새로 고치는 경우) 먼저 저장하는 편이 안전하다.
         */
        if (announce && !stale) await persistCurrent();
        // 프로젝트를 바꾸는 길에서는 저장하지 않는다. 브라우저 저장소의 덱이 폴더를 덮어쓴다.
        settings = await project.loadSettings();
        const loaded = await project.loadDeck();
        deck.replace(loaded);
        const keep = loaded.slides.find((s) => s.id === before) ?? loaded.slides[0];
        if (keep) await api.openSlide(keep.id);
        else showSlide(blankDoc());
        stale = false;
        savedAt = slides.get().updatedAt;
        seen = null;
        notifyState();
        return { had, now: loaded.slides.length };
      };

      // 화면이 붙을 때도 이 길로 온다. 그때까지 알림을 띄우면 열 때마다 토스트가 뜬다.
      if (!announce) {
        try { await read(); } catch (e) { status(msg(e), true); }
        return;
      }

      // 잃을 것이 있으면 먼저 묻는다. 조용히 버리지 않는다.
      if (stale && api.isDirty()) {
        const ok = confirm(
          '디스크가 더 새롭습니다. 디스크 것으로 바꿉니다.\n\n'
          + '저장하지 않은 편집은 사라집니다. 남기려면 취소하고 Ctrl+S 로 먼저 저장하세요.',
        );
        if (!ok) return;
      }

      await withBusy('프로젝트를 다시 읽는 중', '', async () => {
        const { had, now } = await read();
        const delta = now - had;
        toast('ok', delta === 0
          ? `다시 읽음 — 장표 ${now}장`
          : `다시 읽음 — 장표 ${now}장 (${delta > 0 ? `+${delta}` : delta})`);
      });
    },

    setProjectName: (name) => deck.dispatch({ type: 'setName', name }, { coalesce: 'deckName' }),

    settings: () => settings,

    async updateSettings(patch) {
      settings = { ...settings, ...patch };
      try {
        await project.saveSettings(settings);
        status(`설정 저장함 — ${project.isFolder ? SETTINGS_FILE : '브라우저 저장소'}`);
      } catch (e) { status(msg(e), true); }
      draw();
    },

    /* 덱 */
    currentSlideId: () => slides.get().id,
    currentNumber: () => slideNumber(deck.get(), slides.get().id),

    async openSlide(id) {
      if (id === slides.get().id) return;
      await withBusy('장표를 여는 중', '', async () => {
        await persistCurrent();
        showSlide(await project.loadSlide(id));
      });
    },

    async newSlide() {
      try {
        await adoptSlide(blankDoc('새 장표'));
        status('빈 장표 추가함');
      } catch (e) { status(msg(e), true); }
    },

    async addFromHtmlUrl(url) {
      try {
        await adoptSlide(await importKgHtmlFrom(url, { assetBase: `${KG_BASE}assets/` }));
        status('장표 불러옴');
      } catch (e) { status(msg(e), true); }
    },

    async importFiles(files) {
      // 파일 이름이 곧 순서다. 여러 대에서 나눠 그린 장표를 모을 때 이 규칙 하나로 순서가 정해진다.
      const list = [...files].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      if (list.length === 0) return;

      // 같은 이름으로 이미 넣은 장표는 자리를 지키고 내용만 갈아 끼운다.
      // 갈아 끼우면 그 장표에 한 편집은 사라지므로 먼저 알린다.
      const known = new Map(deck.get().slides.filter((s) => s.origin).map((s) => [s.origin!, s]));
      const replacing = list.filter((f) => known.has(f.name));
      if (replacing.length > 0) {
        const names = replacing.slice(0, 5).map((f) => f.name).join(', ');
        const more = replacing.length > 5 ? ` 외 ${replacing.length - 5}건` : '';
        const ok = confirm(
          `이미 있는 장표 ${replacing.length}건을 새 내용으로 바꿉니다.\n${names}${more}\n\n`
          + '자리와 쪽번호는 그대로지만, 그 장표에 편집기로 한 수정은 사라집니다.',
        );
        if (!ok) return;
      }

      await withBusy(`장표 ${list.length}건 적재 중`, `장표 ${list.length}건 적재함`, async () => {
        let n = 0;
        for (const file of list) {
          const prev = known.get(file.name);
          const doc = file.name.endsWith('.json') || file.name.endsWith('.kgslide')
            ? await readDocFile(file)
            : importKgHtml(await file.text(), { origin: file.name, assetBase: `${KG_BASE}assets/` });
          // 기존 id 를 물려받아야 덱의 자리와 미리보기 파일이 그대로 이어진다.
          // 처음 넣는 것은 파일 이름이 앞서는 자리에 끼워 넣는다 — 뒤에 붙이면 번호가 뒤엉킨다.
          const at = prev
            ? deck.get().slides.findIndex((s) => s.id === prev.id)
            : placeByOrigin(deck.get().slides, file.name);
          await adoptSlide(prev ? { ...doc, id: prev.id } : doc, at === undefined || at < 0 ? undefined : at);
          status(`적재 ${++n}/${list.length} — ${file.name}`);
        }
      });
    },

    async duplicateSlide(id) {
      try {
        const sourceId = id ?? slides.get().id;
        const source = sourceId === slides.get().id ? slides.get() : await project.loadSlide(sourceId);
        const now = new Date().toISOString();
        const copy: SlideDoc = {
          ...structuredClone(source),
          id: crypto.randomUUID(),
          title: `${source.title} (사본)`,
          createdAt: now,
          updatedAt: now,
        };
        await adoptSlide(copy, slideNumber(deck.get(), sourceId));
        status('장표 복제함');
      } catch (e) { status(msg(e), true); }
    },

    async deleteSlides(ids) {
      if (ids.length === 0) return;
      await withBusy('장표를 지우는 중', `장표 ${ids.length}장 삭제함`, async () => {
        const before = deck.get().slides;
        deck.dispatch({ type: 'removeSlides', ids });
        await project.saveDeck(deck.get());
        // 파일은 목차에서 빠진 뒤에 지운다. 중간에 실패해도 유령 목차가 남지 않는다.
        for (const id of ids) await project.deleteSlide(id);

        if (ids.includes(slides.get().id)) {
          const at = before.findIndex((s) => s.id === slides.get().id);
          const next = deck.get().slides[Math.min(at, deck.get().slides.length - 1)];
          if (next) showSlide(await project.loadSlide(next.id));
          else showSlide(blankDoc());
        }
        status(`장표 ${ids.length}장 삭제함`);
      });
    },

    reorderSlides(ids) {
      deck.dispatch({ type: 'reorder', ids });
      void project.saveDeck(deck.get());
    },

    moveSlide(id, to) {
      deck.dispatch({ type: 'moveSlide', id, to });
      void project.saveDeck(deck.get());
    },

    /* 저장·내보내기 */
    async save() {
      // 저장은 하나다. 아직 자리가 없으면 이번에 정한다 — 처음 저장할 때 어디에 둘지 묻는
      // 것은 어느 편집기에서나 같다. 브라우저 저장소에만 두면 파일이 되지 못해
      // 명령줄도 다른 컴퓨터도 그 장표를 보지 못한다.
      if (!project.isFolder) {
        await api.saveToFolder();
        return;
      }
      await withBusy('저장하는 중', `저장 완료 — ${project.location}`, async () => {
        const doc = slides.get();
        if (!deck.get().slides.some((s) => s.id === doc.id)) {
          await adoptSlide(doc);
        } else {
          await project.saveSlide(doc);
          deck.dispatch({ type: 'touchSlide', id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
          await project.saveDeck(deck.get());
        }
        savedAt = slides.get().updatedAt;
        notifyState();
        status(`저장함 — ${project.location}`);
      });
    },

    exportHtml() {
      const doc = slides.get();
      downloadText(`${doc.title || 'slide'}.html`, toStandaloneHtml(doc, { cssBase: KG_BASE }));
      status('HTML 내보냄');
    },

    exportJson() {
      downloadDoc(slides.get());
      status('kgslide 내보냄');
    },

    setTitle: (title) => slides.dispatch({ type: 'setTitle', title }, { coalesce: 'title' }),

    run: (cmd) => slides.dispatch(cmd),
    runAll: (cmds) => slides.batch(cmds),
    undo: () => { session?.cancel(); slides.undo(); },
    redo: () => { session?.cancel(); slides.redo(); },

    /* 선택 */
    selection: () => transform?.selection() ?? [],
    select: (ids) => transform?.select(ids),
    selectAll() {
      if (!root) return;
      const doc = slides.get();
      const body = byId(root, 'n')?.querySelector('.kg-body-area');
      const ids = listNodes(root)
        .filter((el) => body?.contains(el) || el.closest('.kg-detached-layer'))
        .map((el) => el.getAttribute('data-kg-id')!)
        .filter((id) => !isRemoved(doc, id));
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
      if (ids.length) slides.dispatch({ type: 'setStyle', ids, style });
    },
    clearStyleSelected() {
      const ids = targets();
      if (ids.length) slides.dispatch({ type: 'clearStyle', ids });
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
      slides.dispatch({ type: 'applyFormat', ids, style: scopeFormat(style, scope) });
      status('서식 붙여넣음');
    },

    /* 존재 */
    removeSelected() {
      const ids = targets();
      if (ids.length === 0) return;
      slides.dispatch({ type: 'remove', ids });
      transform?.select([]);
      status(`${ids.length}개 삭제함 — 되돌리기로 복구 가능`);
    },
    restore(ids) {
      if (ids.length) slides.dispatch({ type: 'restore', ids });
    },
    removedList: () => slides.get().tree.removed,

    insert(kind) {
      const spec = SNIPPETS[kind];
      const { cmds, ids } = insertCommands([snippetNode(kind)], [placeRect(spec.size.w, spec.size.h)]);
      slides.batch(cmds);
      transform?.select(ids);
      status(`${spec.label} 추가함`);
    },

    duplicate(explicit) {
      const doc = slides.get();
      const ids = explicit ? editable(doc, expandSelection(doc, explicit)) : targets();
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
      slides.batch(cmds);
      transform?.select(newIds);
      return newIds;
    },

    copySelected() {
      const ids = targets();
      if (!root || ids.length === 0) return;
      const nodes = ids
        .map((id) => ({ id, el: elementOf(id) }))
        .filter((x): x is { id: NodeId; el: HTMLElement } => !!x.el)
        .map(({ id, el }) => cloneNodeSnapshot(el, id));
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
      slides.batch(cmds);
      transform?.select(ids);
      status(`${nodes.length}개 붙여넣음`);
    },

    groupSelected() {
      const ids = targets();
      if (ids.length < 2) return;
      slides.dispatch({ type: 'group', groupId: newGroupId(), ids });
      status(`${ids.length}개 그룹으로 묶음`);
    },

    ungroupSelected() {
      const doc = slides.get();
      const gids = [...new Set(api.selection().map((id) => groupOf(doc, id)).filter((g): g is string => !!g))];
      if (gids.length) slides.dispatch({ type: 'ungroup', groupIds: gids });
    },

    lockSelected(locked) {
      const ids = api.selection();
      if (ids.length) slides.dispatch({ type: 'setLocked', ids, locked });
    },

    /* 배치 */
    detachSelected() {
      if (!root) return;
      const s = scale();
      const cmds: Command[] = [];
      for (const id of targets()) {
        if (slides.get().patches[id]?.layout?.mode === 'detached') continue;
        const el = elementOf(id);
        if (el) cmds.push({ type: 'detach', id, rect: canvasRect(root, el, s) });
      }
      if (cmds.length) slides.batch(cmds);
    },
    reflowSelected() {
      const ids = targets();
      if (ids.length) slides.dispatch({ type: 'reflow', ids });
    },
    alignSelected(edge) {
      const ids = targets();
      if (ids.length > 1) slides.dispatch({ type: 'alignObjects', ids, edge });
    },
    distributeSelected(axis) {
      const ids = targets();
      if (ids.length > 2) slides.dispatch({ type: 'distribute', ids, axis });
    },
    orderSelected(op) {
      const ids = targets();
      if (ids.length) slides.dispatch({ type: 'order', ids, op });
    },
    nudgeSelected(dx, dy) {
      const ids = targets();
      if (ids.length) slides.dispatch({ type: 'nudge', ids, dx, dy }, { coalesce: `nudge:${ids.join()}` });
    },

    /* 위계 */
    setRoleStyle: (role, style) => slides.dispatch({ type: 'setRoleStyle', role, style }),
    setThemeScale: (s) => slides.dispatch({ type: 'setThemeScale', scale: s }, { coalesce: 'scale' }),
    resetTheme: () => slides.dispatch({ type: 'resetTheme' }),

    roleOfNode: (id) => roleOf(elementOf(id)),

    roleCounts() {
      const counts: Record<string, number> = {};
      if (!root) return counts;
      for (const el of root.querySelectorAll(`[${ROLE_ATTR}]`)) {
        if (el.closest('.kg-slot')) continue;
        const r = el.getAttribute(ROLE_ATTR)!;
        counts[r] = (counts[r] ?? 0) + 1;
      }
      return counts;
    },

    /** 위계마다 대표 요소 하나를 재서 현재 값을 알려 준다. 설정 칸의 빈 값을 메우는 용도. */
    roleMetrics() {
      const out: Record<string, { fontSize: number; fontWeight: number; color: string }> = {};
      if (!root) return out;
      for (const el of root.querySelectorAll<HTMLElement>(`[${ROLE_ATTR}]`)) {
        const r = el.getAttribute(ROLE_ATTR)!;
        if (out[r] || el.closest('.kg-slot')) continue;
        const cs = getComputedStyle(el);
        out[r] = {
          fontSize: Math.round(parseFloat(cs.fontSize) * 10) / 10,
          fontWeight: Number(cs.fontWeight) || 400,
          color: cs.color,
        };
      }
      return out;
    },

    shapeVars() {
      const id = api.selection()[0];
      const el = id ? elementOf(id) : null;
      if (!el) return [];
      const svg = el.matches('svg') ? el : el.querySelector('svg');
      if (!svg) return [];
      const found = svg.outerHTML.match(/var\(\s*(--[a-z0-9-]+)/g) ?? [];
      return [...new Set(found.map((m) => m.replace(/var\(\s*/, '')))].sort();
    },

    neighbors() {
      const id = api.selection()[0];
      const el = id ? elementOf(id) : null;
      return root && el ? neighborsOf(root, el, scale()) : [];
    },

    async copyReference() {
      const ids = api.selection();
      if (ids.length === 0) {
        status('먼저 요소를 고르세요', true);
        return;
      }
      const text = buildReference({
        doc: slides.get(), projectName: api.projectName(), ids, root,
      });
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // 권한이 막히거나 안전하지 않은 출처면 옛 방식으로 물러난다.
        const box = document.createElement('textarea');
        box.value = text;
        box.style.cssText = 'position:fixed;left:-9999px;';
        document.body.appendChild(box);
        box.select();
        document.execCommand('copy');
        box.remove();
      }
      status(`참조 복사함 — ${ids.length}개. 채팅창에 붙여 넣으세요`);
      toast('ok', `참조 복사함 — ${ids.length}개`);
    },

    scaleTextInside(factor, growBox) {
      if (!root) return;
      const doc = slides.get();
      const cmds: Command[] = [];
      let clamped = 0;

      for (const id of targets()) {
        const host = elementOf(id);
        if (!host) continue;

        const runs = host.matches('[data-kg-text]')
          ? [host]
          : [...host.querySelectorAll<HTMLElement>('[data-kg-text]')];

        for (const run of runs) {
          const runId = run.getAttribute('data-kg-id');
          if (!runId) continue;
          const now = parseFloat(getComputedStyle(run).fontSize);
          if (Number.isNaN(now)) continue;
          const floor = floorFor(settings, roleOf(run));
          const next = Math.round(now * factor * 10) / 10;
          if (next < floor) clamped++;
          cmds.push({
            type: 'setStyle', ids: [runId], style: { fontSize: Math.max(floor, next) },
          });
        }

        if (growBox) {
          const rect = canvasRect(root, host, scale());
          if (doc.patches[id]?.layout?.mode !== 'detached') {
            cmds.push({ type: 'detach', id, rect });
          }
          cmds.push({
            type: 'setRect', id,
            rect: { w: Math.round(rect.w * factor), h: Math.round(rect.h * factor) },
          });
        }
      }

      if (cmds.length === 0) return;
      slides.batch(cmds);
      status(clamped
        ? `안쪽 글자 조정 — ${clamped}개는 프로젝트 하한(${settings.minFontSize}px)에서 멈췄습니다`
        : '안쪽 글자 조정함');
    },

    marqueeMode: () => transform?.marqueeMode() ?? 'cross',
    setMarqueeMode(mode) {
      transform?.setMarqueeMode(mode);
      status(mode === 'contain'
        ? '포함 선택 — 상자가 통째로 들어온 것만 고릅니다'
        : '교차 선택 — 조금이라도 걸치면 고릅니다');
    },

    scaleSelected(factor, anchor) {
      const ids = targets().filter((id) => slides.get().patches[id]?.layout?.mode === 'detached');
      if (ids.length) slides.dispatch({ type: 'scaleObject', ids, factor, anchor });
      else status('먼저 떼어내야 크기를 조절할 수 있습니다', true);
    },

    /* 검사 */
    audit: () => (root ? auditOverflow(root, slides.get().id, settings) : []),

    /**
     * 덱 전체 검사.
     * 열려 있는 장표는 화면 그대로 재고, 나머지는 화면 밖에 잠깐 그려 잰다.
     * 잰 뒤에는 반드시 걷어낸다.
     */
    async auditDeck() {
      const current = slides.get();
      const found = root ? auditOverflow(root, current.id, settings) : [];

      const scratch = document.createElement('div');
      scratch.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;';
      document.body.appendChild(scratch);
      try {
        for (const entry of deck.get().slides) {
          if (entry.id === current.id) continue;
          try {
            const other = await project.loadSlide(entry.id);
            const { root: otherRoot } = render(scratch, other);
            found.push(...auditOverflow(otherRoot, entry.id, settings));
          } catch {
            // 못 읽는 장표는 건너뛴다. 검사가 통째로 멈추면 안 된다.
          }
        }
      } finally {
        scratch.remove();
      }
      return found;
    },

    async focusIssue(issue) {
      if (issue.slideId && issue.slideId !== slides.get().id) await api.openSlide(issue.slideId);
      transform?.select([issue.id]);
      elementOf(issue.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },

    fixOptions(id) {
      const el = elementOf(id);
      return el ? fixOptions(el, settings) : [];
    },

    applyFix(id, option) {
      const cmds: Command[] = [];
      if (option.style) cmds.push({ type: 'setStyle', ids: [id], style: option.style });
      if (option.rect) {
        // 박스 크기로 푸는 경우, 흐름 안에 있으면 먼저 떼어내야 좌표가 생긴다.
        if (root && slides.get().patches[id]?.layout?.mode !== 'detached') {
          const el = elementOf(id);
          if (el) cmds.push({ type: 'detach', id, rect: canvasRect(root, el, scale()) });
        }
        cmds.push({ type: 'setRect', id, rect: option.rect });
      }
      if (cmds.length) slides.batch(cmds);
      status(`${option.label} — ${option.change}`);
    },

    fixOverflow(ids) {
      if (!root) return;
      const issues = auditOverflow(root, undefined, settings).filter((i) => i.kind === 'clipped' && (!ids || ids.includes(i.id)));
      const cmds: Command[] = [];
      const unresolved: string[] = [];
      for (const issue of issues) {
        const el = elementOf(issue.id);
        if (!el) continue;
        const size = fitFontSize(el, settings);
        if (size) cmds.push({ type: 'setStyle', ids: [issue.id], style: { fontSize: size } });
        else unresolved.push(issue.id);
      }
      if (cmds.length) slides.batch(cmds);
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

    onBusy(fn) {
      busyListeners.add(fn);
      return () => busyListeners.delete(fn);
    },

    onToast(fn) {
      toastListeners.add(fn);
      return () => toastListeners.delete(fn);
    },
  };

  return api;
}

function emptyDeck(): DeckDoc {
  const now = new Date().toISOString();
  return { v: 1, id: crypto.randomUUID(), name: '', slides: [], createdAt: now, updatedAt: now };
}

export { KG_CANVAS };

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
