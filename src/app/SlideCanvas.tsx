/**
 * 캔버스 호스트.
 * React는 빈 상자 두 개만 만들고 물러난다. 안쪽 DOM은 editor.ts 가 소유한다.
 * 우클릭 메뉴와 버블 툴바의 위치만 여기서 잡아 위로 올려 보낸다.
 */
import { useEffect, useRef } from 'react';
import type { NodeId } from '@contract/index';
import type { EditorApi } from './editor';
import type { MenuPoint } from './menus';

export function SlideCanvas({
  api, selection, onContextMenu, onAnchor,
}: {
  api: EditorApi;
  selection: NodeId[];
  onContextMenu(at: MenuPoint): void;
  onAnchor(rect: DOMRect | null): void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvas.current || !stage.current || !paper.current) return;
    return api.attachCanvas(canvas.current, stage.current, paper.current);
  }, [api]);

  // 선택이 바뀌면 버블 툴바가 붙을 자리를 알려 준다.
  useEffect(() => {
    const id = selection[0];
    if (!id || !paper.current) {
      onAnchor(null);
      return;
    }
    const el = paper.current.querySelector<HTMLElement>(`[data-kg-id="${CSS.escape(id)}"]`);
    onAnchor(el ? el.getBoundingClientRect() : null);
  }, [selection, onAnchor]);

  return (
    <div
      className="ed-canvas"
      data-area="canvas"
      ref={canvas}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="ed-stage" ref={stage}>
        <div className="ed-paper" data-hint="on" ref={paper} />
      </div>
    </div>
  );
}
