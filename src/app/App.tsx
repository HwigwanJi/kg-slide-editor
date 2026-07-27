/**
 * App — 배선만 한다.
 *
 * 여기에 들어가도 되는 것: 조각을 배치하고, 스토어에서 읽은 값을 내려주는 일.
 * 여기에 들어가면 안 되는 것: 편집 규칙, 좌표 계산, DOM 조작, 스타일 값.
 *   → 각각 core/commands.ts, adapters/transform.pointer.ts, app/editor.ts, styles/tokens/ 에 있다.
 */
import { DocRail } from './DocRail';
import { Inspector } from './Inspector';
import { SlideCanvas } from './SlideCanvas';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { useDoc, useEditorApi, useSavedList, useSelection, useStatus, useTokens } from './hooks';

export default function App() {
  const api = useEditorApi();
  const doc = useDoc(api);
  const selection = useSelection(api);
  const status = useStatus(api);
  const tokens = useTokens(api);
  // 저장은 문서를 바꾸지 않으므로 updatedAt 만으로는 목록이 갱신되지 않는다. 상태 메시지도 신호로 쓴다.
  const saved = useSavedList(api, `${doc.updatedAt}|${status.message}`);

  return (
    <div className="ed-app">
      <Toolbar api={api} title={doc.title} selected={selection.length} />
      <DocRail api={api} saved={saved} currentId={doc.id} />
      <SlideCanvas api={api} />
      <Inspector api={api} doc={doc} selection={selection} tokens={tokens} />
      <StatusBar doc={doc} status={status} selected={selection.length} />
    </div>
  );
}
