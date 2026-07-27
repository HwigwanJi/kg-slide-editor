/**
 * 슬라이드 목록 — 프로젝트의 순서를 보여 주고 바꾼다.
 * 순서의 진실은 덱 문서에 있다. 여기서는 끌어 놓은 결과를 커맨드로 넘길 뿐이다.
 */
import { useState, type DragEvent } from 'react';
import type { DeckDoc } from '@contract/index';
import type { EditorApi } from './editor';

const FIXTURES: [string, string][] = [
  ['/fixtures/05_DiagnosisReview.html', '샘플 · 진단검토형'],
  ['/fixtures/07_Matrix.html', '샘플 · 매트릭스형'],
];

export function DeckRail({
  api, deck, currentId, onSlideMenu,
}: {
  api: EditorApi;
  deck: DeckDoc;
  currentId: string;
  /** 장표를 우클릭했을 때. 어느 장표인지와 어디서 눌렀는지를 올려 보낸다. */
  onSlideMenu(id: string, at: { x: number; y: number }): void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  /** 끌고 있는 장표가 놓일 자리 — 어느 줄의 위인지 아래인지. */
  const [mark, setMark] = useState<{ id: string; after: boolean } | null>(null);

  const reset = () => { setDragging(null); setMark(null); };

  /** 커서가 줄의 위쪽 절반이면 그 앞, 아래쪽 절반이면 그 뒤에 놓는다. */
  const aim = (id: string, e: DragEvent<HTMLLIElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMark({ id, after: e.clientY > r.top + r.height / 2 });
  };

  const drop = () => {
    if (!dragging || !mark) return reset();
    // 자리 계산은 끌고 있는 장표를 뺀 목록에서 한다.
    // 원래 목록의 번호를 그대로 쓰면 아래로 끌 때 한 칸씩 밀린다.
    const ids = deck.slides.map((s) => s.id).filter((id) => id !== dragging);
    const at = ids.indexOf(mark.id);
    if (at < 0) return reset();
    ids.splice(at + (mark.after ? 1 : 0), 0, dragging);
    api.reorderSlides(ids);
    reset();
  };

  return (
    <nav className="ed-rail" data-area="rail">
      <input
        className="ed-input"
        value={deck.name}
        placeholder="프로젝트 이름"
        onChange={(e) => api.setProjectName(e.target.value)}
      />
      <div className="ed-group">
        <button className="ed-btn" onClick={() => void api.openFolder()} title="Claude Code 가 만든 장표 폴더를 엽니다">
          폴더 열기
        </button>
        <button className="ed-btn" onClick={() => void api.newSlide()}>새 장표</button>
      </div>

      <span className="ed-label">슬라이드 {deck.slides.length}</span>
      <ol className="ed-slidelist">
        {deck.slides.map((s, i) => (
          <li
            key={s.id}
            className="ed-slidelist__row"
            data-drop={mark?.id === s.id && dragging !== s.id ? (mark.after ? 'after' : 'before') : undefined}
            onContextMenu={(e) => { e.preventDefault(); onSlideMenu(s.id, { x: e.clientX, y: e.clientY }); }}
            onDragOver={(e) => { e.preventDefault(); aim(s.id, e); }}
            onDrop={(e) => { e.preventDefault(); drop(); }}
          >
            <button
              className="ed-slide"
              draggable
              aria-current={s.id === currentId}
              data-dragging={dragging === s.id ? '' : undefined}
              title="끌어서 순서를 바꿉니다. 순서가 곧 꼬리말 쪽번호입니다"
              onClick={() => void api.openSlide(s.id)}
              onDragStart={() => setDragging(s.id)}
              onDragEnd={reset}
            >
              <span className="ed-slide__no">{i + 1}</span>
              <span className="ed-slide__body">
                <span className="ed-slide__title">{s.title || '제목 없음'}</span>
                <span className="ed-rail__meta">{s.updatedAt.slice(0, 16).replace('T', ' ')}</span>
              </span>
            </button>
            <button
              className="ed-slide__del"
              title="이 장표를 프로젝트에서 지웁니다. 파일까지 지우므로 되돌릴 수 없습니다"
              aria-label={`${i + 1}번 장표 삭제`}
              onClick={() => {
                if (window.confirm(`${i + 1}. ${s.title || '제목 없음'}\n\n이 장표를 지웁니다. 되돌릴 수 없습니다.`)) {
                  void api.deleteSlides([s.id]);
                }
              }}
            >×</button>
          </li>
        ))}
      </ol>
      {deck.slides.length === 0 && <p className="ed-empty">장표가 없습니다. 폴더를 열거나 샘플로 시작하세요.</p>}

      <span className="ed-label">샘플 장표</span>
      {FIXTURES.map(([url, label]) => (
        <button key={url} className="ed-rail__item" onClick={() => void api.addFromHtmlUrl(url)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
