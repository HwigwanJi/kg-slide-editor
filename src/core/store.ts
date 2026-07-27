/**
 * 문서 스토어 — 문서 한 부, 이력 한 줄.
 *
 * 상태 라이브러리를 쓰지 않는다. 필요한 것이 "문서 하나 + 구독 + 되돌리기"뿐이라
 * 여기 90줄이 라이브러리 한 개보다 유지보수가 싸다.
 * React는 useSyncExternalStore 로 이 스토어를 구독만 한다. 문서를 복제해 들고 있지 않는다.
 *
 * 장표와 덱이 같은 구현을 쓴다. 문서 종류마다 스토어를 따로 만들면 이력·구독 규칙이
 * 곧 갈라지므로, 바뀌는 부분(커맨드 적용, 시각 도장)만 주입받는다.
 */
const HISTORY_LIMIT = 100;

export interface DispatchOptions {
  /**
   * 같은 키로 연속해서 들어온 변경은 이력에서 하나로 합친다.
   * 예: 타이핑 중 setText 는 `text:<id>` 로 묶어 실행취소 한 번에 되돌린다.
   */
  coalesce?: string;
}

export interface Store<D, C> {
  get(): D;
  dispatch(cmd: C, opts?: DispatchOptions): void;
  /** 여러 커맨드를 한 번의 실행취소 단위로 묶는다. */
  batch(cmds: C[]): void;
  replace(doc: D): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createStore<D, C>(
  initial: D,
  apply: (doc: D, cmd: C) => D,
  /** 커밋될 때 문서에 찍는 도장(보통 updatedAt). 순수성을 커맨드 밖으로 밀어내기 위한 것. */
  touch: (doc: D) => D,
): Store<D, C> {
  let doc = initial;
  let past: D[] = [];
  let future: D[] = [];
  let lastKey: string | null = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());

  const commit = (next: D, coalesce?: string) => {
    if (next === doc) return;
    const merge = coalesce !== undefined && coalesce === lastKey;
    if (!merge) {
      past.push(doc);
      if (past.length > HISTORY_LIMIT) past = past.slice(-HISTORY_LIMIT);
    }
    lastKey = coalesce ?? null;
    future = [];
    doc = touch(next);
    emit();
  };

  return {
    get: () => doc,

    dispatch(cmd, opts) {
      commit(apply(doc, cmd), opts?.coalesce);
    },

    batch(cmds) {
      commit(cmds.reduce(apply, doc));
    },

    replace(next) {
      doc = next;
      past = [];
      future = [];
      lastKey = null;
      emit();
    },

    undo() {
      const prev = past.pop();
      if (!prev) return;
      future.push(doc);
      doc = prev;
      lastKey = null;
      emit();
    },

    redo() {
      const next = future.pop();
      if (!next) return;
      past.push(doc);
      doc = next;
      lastKey = null;
      emit();
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
