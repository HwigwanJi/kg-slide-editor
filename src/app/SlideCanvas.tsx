/**
 * 캔버스 호스트.
 * React는 빈 상자 두 개만 만들고 물러난다. 안쪽 DOM은 editor.ts 가 소유한다.
 */
import { useEffect, useRef } from 'react';
import type { EditorApi } from './editor';

export function SlideCanvas({ api }: { api: EditorApi }) {
  const stage = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stage.current || !paper.current) return;
    return api.attachCanvas(stage.current, paper.current);
  }, [api]);

  return (
    <div className="ed-canvas" data-area="canvas">
      <div className="ed-stage" ref={stage}>
        <div className="ed-paper" data-hint="on" ref={paper} />
      </div>
    </div>
  );
}
