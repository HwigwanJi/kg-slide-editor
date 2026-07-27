/**
 * 클립보드 — 개체와 서식을 따로 담는다.
 *
 * 시스템 클립보드를 쓰지 않는 이유: 개체 복사는 문서 내부 형식이라 밖으로 나갈 일이 없고,
 * 시스템 클립보드는 권한·비동기·형식 협상이 붙어 얻는 것보다 드는 비용이 크다.
 * 세션 안에서만 유지되며, 창을 닫으면 비워진다.
 *
 * 서식 클립보드가 개체 클립보드와 분리되어 있다는 점이 중요하다.
 * Ctrl+C 로 개체를 담아 둔 상태에서 Ctrl+Shift+C 로 서식을 따로 담을 수 있다.
 */
import type { AddedNode, StylePatch } from '@contract/index';

interface ClipboardState {
  nodes: AddedNode[];
  format: StylePatch | null;
}

const state: ClipboardState = { nodes: [], format: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const clipboard = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /* 개체 */
  putNodes(nodes: AddedNode[]): void {
    state.nodes = nodes;
    emit();
  },
  takeNodes(): AddedNode[] {
    return state.nodes;
  },
  hasNodes(): boolean {
    return state.nodes.length > 0;
  },

  /* 서식 */
  putFormat(style: StylePatch): void {
    state.format = style;
    emit();
  },
  takeFormat(): StylePatch | null {
    return state.format;
  },
  hasFormat(): boolean {
    return state.format !== null;
  },

  clear(): void {
    state.nodes = [];
    state.format = null;
    emit();
  },
};
