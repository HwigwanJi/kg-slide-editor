/** 상태바 — 현재 상태와 문서 규모. */
import type { SlideDoc } from '@contract/index';
import type { Status } from './editor';

export function StatusBar({
  doc, status, selected, issues,
}: {
  doc: SlideDoc;
  status: Status;
  selected: number;
  issues: number;
}) {
  return (
    <div className="ed-statusbar" data-area="status">
      <span className={status.error ? 'ed-statusbar__error' : undefined}>{status.message}</span>
      <span className="ed-statusbar__spacer" />
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
