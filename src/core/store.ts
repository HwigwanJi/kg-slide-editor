/**
 * 문서 스토어 — 문서 한 부, 이력 한 줄.
 *
 * 상태 라이브러리를 쓰지 않는다. 필요한 것이 "문서 하나 + 구독 + 되돌리기"뿐이라
 * 여기 60줄이 라이브러리 한 개보다 유지보수가 싸다.
 * React는 useSyncExternalStore 로 이 스토어를 구독만 한다. 문서를 복제해 들고 있지 않는다.
 */
import type { SlideDoc } from '@contract/index';
import { apply, type Command } from './commands';

const HISTORY_LIMIT = 100;

export interface DispatchOptions {
  /**
   * 같은 키로 연속해서 들어온 변경은 이력에서 하나로 합친다.
   * 예: 타이핑 중 setText 는 `text:<id>` 로 묶어 실행취소 한 번에 되돌린다.
   */
  coalesce?: string;
}

export interface Store {
  get(): SlideDoc;
  dispatch(cmd: Command, opts?: DispatchOptions): void;
  /** 여러 커맨드를 한 번의 실행취소 단위로 묶는다. */
  batch(cmds: Command[]): void;
  replace(doc: SlideDoc): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createStore(initial: SlideDoc, now: () => string = () => new Date().toISOString()): Store {
  let doc = initial;
  let past: SlideDoc[] = [];
  let future: SlideDoc[] = [];
  let lastKey: string | null = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());

  const commit = (next: SlideDoc, coalesce?: string) => {
    if (next === doc) return;
    const merge = coalesce !== undefined && coalesce === lastKey;
    if (!merge) {
      past.push(doc);
      if (past.length > HISTORY_LIMIT) past = past.slice(-HISTORY_LIMIT);
    }
    lastKey = coalesce ?? null;
    future = [];
    doc = { ...next, updatedAt: now() };
    emit();
  };

  return {
    get: () => doc,

    dispatch(cmd, opts) {
      commit(apply(doc, cmd), opts?.coalesce);
    },

    batch(cmds) {
      const next = cmds.reduce(apply, doc);
      commit(next);
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
