/** 상태바 — 현재 상태와 문서 규모. */
import type { DeckDoc, SlideDoc } from '@contract/index';
import type { Status } from './editor';

export function StatusBar({
  doc, deck, status, selected, issues, dirty, stale,
}: {
  doc: SlideDoc;
  deck: DeckDoc;
  status: Status;
  selected: number;
  issues: number;
  /** 저장하지 않은 편집이 있는가 */
  dirty: boolean;
  /** 디스크가 더 새로워 다시 읽어야 하는가 */
  stale: boolean;
}) {
  const at = deck.slides.findIndex((s) => s.id === doc.id) + 1;
  return (
    <div className="ed-statusbar" data-area="status">
      <span className={status.error ? 'ed-statusbar__error' : undefined}>{status.message}</span>
      <span className="ed-statusbar__spacer" />
      {/* 저장 상태는 다른 수치보다 먼저 눈에 들어와야 한다. 잃을 수 있는 것은 이것뿐이다. */}
      <span className={dirty ? 'ed-statusbar__warn' : undefined}>
        {dirty ? '저장 안 함 · Ctrl+S' : '저장됨'}
      </span>
      {stale && <span className="ed-statusbar__warn">디스크가 더 새로움 · 다시 읽기</span>}
      <span>{at > 0 ? `${at} / ${deck.slides.length}` : '미저장'}</span>
      <span>Ctrl+K 명령 목록</span>
      <span>선택 {selected}</span>
      <span>패치 {Object.keys(doc.patches).length}</span>
      <span>추가 {Object.keys(doc.tree.added).length}</span>
      <span>삭제 {doc.tree.removed.length}</span>
      <span className={issues ? 'ed-statusbar__error' : undefined}>넘침 {issues}</span>
      <span>{doc.canvas.w}×{doc.canvas.h}</span>
      <span>계약 v{doc.v}</span>
    </div>
  );
}
