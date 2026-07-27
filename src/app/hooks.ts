/**
 * React ↔ 스토어 다리.
 * 문서를 React state 로 복제하지 않는다. 구독해서 읽기만 한다(진실은 스토어 하나).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KgToken, NodeId, SlideDoc, SlideMeta } from '@contract/index';
import { createEditor, type EditorApi } from './editor';

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

export function useStatus(api: EditorApi): { message: string; error?: boolean } {
  const [s, setS] = useState<{ message: string; error?: boolean }>({ message: '준비' });
  useEffect(() => api.onStatus(setS), [api]);
  return s;
}

export function useTokens(api: EditorApi): KgToken[] {
  const [tokens, setTokens] = useState<KgToken[]>([]);
  useEffect(() => {
    let alive = true;
    api.tokens().then((t) => alive && setTokens(t)).catch(() => undefined);
    return () => { alive = false; };
  }, [api]);
  return tokens;
}

/** 저장 목록. 문서가 바뀔 때마다 다시 읽는다. */
export function useSavedList(api: EditorApi, revision: string): SlideMeta[] {
  const [list, setList] = useState<SlideMeta[]>([]);
  useEffect(() => {
    let alive = true;
    api.list().then((l) => alive && setList(l)).catch(() => undefined);
    return () => { alive = false; };
  }, [api, revision]);
  return list;
}
