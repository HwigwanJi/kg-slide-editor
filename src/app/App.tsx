/**
 * App — 배선만 한다.
 *
 * 여기에 들어가도 되는 것: 조각 배치와 값 전달, 그리고 화면 사이에 걸친 아주 얕은 상태(메뉴 열림 등).
 * 여기에 들어가면 안 되는 것: 편집 규칙, 좌표 계산, DOM 조작, 스타일 값, 액션 목록.
 *   → core/commands.ts, adapters/transform.pointer.ts, app/editor.ts, styles/tokens/, app/actions.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { DeckRail } from './DeckRail';
import { Inspector } from './Inspector';
import { SlideCanvas } from './SlideCanvas';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { BubbleToolbar, CommandPalette, ContextMenu, type MenuPoint } from './menus';
import { installShortcuts } from './shortcuts';
import {
  useActionCtx, useAudit, useDeck, useDoc, useEditorApi, useSelection, useStatus, useTokens,
} from './hooks';

export default function App() {
  const api = useEditorApi();
  const doc = useDoc(api);
  const deck = useDeck(api);
  const selection = useSelection(api);
  const status = useStatus(api);
  const ctx = useActionCtx(api, doc, deck, selection);

  const revision = `${doc.id}|${doc.updatedAt}|${status.message}`;
  const tokens = useTokens(api, revision);
  const issues = useAudit(api, revision);

  const [menuAt, setMenuAt] = useState<MenuPoint | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // 단축키는 액션 레지스트리에서만 나온다. 명령 목록 열기만 여기서 다룬다.
  useEffect(() => installShortcuts(() => ctx), [ctx]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ed-app">
      <Toolbar api={api} title={doc.title} ctx={ctx} />
      <DeckRail api={api} deck={deck} currentId={doc.id} />
      <SlideCanvas
        api={api}
        selection={selection}
        onContextMenu={setMenuAt}
        onAnchor={useCallback((r: DOMRect | null) => setAnchor(r), [])}
      />
      <Inspector api={api} doc={doc} selection={selection} tokens={tokens} issues={issues} />
      <StatusBar doc={doc} deck={deck} status={status} selected={selection.length} issues={issues.length} />

      <ContextMenu at={menuAt} ctx={ctx} onClose={useCallback(() => setMenuAt(null), [])} />
      <BubbleToolbar anchor={anchor} ctx={ctx} />
      <CommandPalette open={paletteOpen} ctx={ctx} onClose={useCallback(() => setPaletteOpen(false), [])} />
    </div>
  );
}
