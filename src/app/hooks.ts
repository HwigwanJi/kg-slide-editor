/**
 * React ↔ 스토어 다리.
 * 문서를 React state 로 복제하지 않는다. 구독해서 읽기만 한다(진실은 스토어 하나).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { KgToken, NodeId, SlideDoc, SlideMeta } from '@contract/index';
import { groupOf, isLocked, type OverflowIssue } from '@core/index';
import { clipboard } from '@adapters/index';
import { createEditor, type EditorApi, type Status } from './editor';
import type { ActionCtx } from './actions';

export function useEditorApi(): EditorApi {
  const ref = useRef<EditorApi | null>(null);
  if (!ref.current) ref.current = createEditor();
  return ref.current;
}

export function useDoc(api: EditorApi): SlideDoc {
  return useSyncExternalStore(api.store.subscribe, api.store.get);
}

export function useSelection(api: EditorApi): NodeId[] {
  const [ids, setIds] = useState<NodeId[]>([]);
  useEffect(() => api.onSelection(setIds), [api]);
  return ids;
}

export function useStatus(api: EditorApi): Status {
  const [s, setS] = useState<Status>({ message: '준비' });
  useEffect(() => api.onStatus(setS), [api]);
  return s;
}

export function useTokens(api: EditorApi, revision: string): KgToken[] {
  return useMemo(() => api.tokens(), [api, revision]);
}

export function useClipboard(): { nodes: boolean; format: boolean } {
  const snapshot = useCallback(() => `${clipboard.hasNodes()}|${clipboard.hasFormat()}`, []);
  const snap = useSyncExternalStore(clipboard.subscribe, snapshot, () => 'false|false');
  const [nodes, format] = snap.split('|');
  return { nodes: nodes === 'true', format: format === 'true' };
}

/** 액션이 판단에 쓰는 문맥. 툴바·메뉴·단축키가 같은 값을 본다. */
export function useActionCtx(api: EditorApi, doc: SlideDoc, selection: NodeId[]): ActionCtx {
  const clip = useClipboard();
  return useMemo(() => ({
    api,
    count: selection.length,
    hasDetached: selection.some((id) => doc.patches[id]?.layout?.mode === 'detached'),
    allLocked: selection.length > 0 && selection.every((id) => isLocked(doc, id)),
    inGroup: selection.some((id) => groupOf(doc, id) !== null),
    hasClipboardNodes: clip.nodes,
    hasClipboardFormat: clip.format,
    removedCount: doc.tree.removed.length,
  }), [api, doc, selection, clip.nodes, clip.format]);
}

/** 저장 목록. 문서·상태가 바뀔 때마다 다시 읽는다. */
export function useSavedList(api: EditorApi, revision: string): SlideMeta[] {
  const [list, setList] = useState<SlideMeta[]>([]);
  useEffect(() => {
    let alive = true;
    api.list().then((l) => alive && setList(l)).catch(() => undefined);
    return () => { alive = false; };
  }, [api, revision]);
  return list;
}

/** 넘침 검사 결과. 문서가 바뀌면 다시 잰다(렌더가 끝난 뒤 한 프레임 미뤄서). */
export function useAudit(api: EditorApi, revision: string): OverflowIssue[] {
  const [issues, setIssues] = useState<OverflowIssue[]>([]);
  useEffect(() => {
    const t = window.setTimeout(() => setIssues(api.audit()), 60);
    return () => window.clearTimeout(t);
  }, [api, revision]);
  return issues;
}
