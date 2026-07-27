/**
 * 슬라이드 목록 — 프로젝트의 순서를 보여 주고 바꾼다.
 * 순서의 진실은 덱 문서에 있다. 여기서는 끌어 놓은 결과를 커맨드로 넘길 뿐이다.
 */
import { useState } from 'react';
import type { DeckDoc } from '@contract/index';
import type { EditorApi } from './editor';

const FIXTURES: [string, string][] = [
  ['/fixtures/05_DiagnosisReview.html', '샘플 · 진단검토형'],
  ['/fixtures/07_Matrix.html', '샘플 · 매트릭스형'],
];

export function DeckRail({ api, deck, currentId }: { api: EditorApi; deck: DeckDoc; currentId: string }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const ids = deck.slides.map((s) => s.id).filter((id) => id !== dragging);
    ids.splice(deck.slides.findIndex((s) => s.id === targetId), 0, dragging);
    api.reorderSlides(ids);
    setDragging(null);
    setOver(null);
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
          <li key={s.id}>
            <button
              className="ed-slide"
              draggable
              aria-current={s.id === currentId}
              data-over={over === s.id ? '' : undefined}
              onClick={() => void api.openSlide(s.id)}
              onDragStart={() => setDragging(s.id)}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver((v) => (v === s.id ? null : v))}
              onDrop={(e) => { e.preventDefault(); drop(s.id); }}
              onDragEnd={() => { setDragging(null); setOver(null); }}
            >
              <span className="ed-slide__no">{i + 1}</span>
              <span className="ed-slide__body">
                <span className="ed-slide__title">{s.title || '제목 없음'}</span>
                <span className="ed-rail__meta">{s.updatedAt.slice(0, 16).replace('T', ' ')}</span>
              </span>
            </button>
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
