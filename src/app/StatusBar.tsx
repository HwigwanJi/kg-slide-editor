/** 상태바 — 현재 상태와 문서 규모. */
import type { SlideDoc } from '@contract/index';

export function StatusBar({
  doc, status, selected,
}: {
  doc: SlideDoc;
  status: { message: string; error?: boolean };
  selected: number;
}) {
  return (
    <div className="ed-statusbar" data-area="status">
      <span className={status.error ? 'ed-statusbar__error' : undefined}>{status.message}</span>
      <span className="ed-statusbar__spacer" />
      <span>선택 {selected}</span>
      <span>패치 {Object.keys(doc.patches).length}</span>
      <span>떼어냄 {doc.stack.length}</span>
      <span>{doc.canvas.w}×{doc.canvas.h}</span>
      <span>계약 v{doc.v}</span>
    </div>
  );
}
