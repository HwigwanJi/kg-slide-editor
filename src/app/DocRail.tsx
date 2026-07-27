/**
 * 좌측 레일 — 저장된 문서와 샘플 장표.
 * 샘플 목록은 개발용이며, 실제 장표 원본은 사용자가 열어서 넣는다.
 */
import type { SlideMeta } from '@contract/index';
import type { EditorApi } from './editor';

const FIXTURES: [string, string][] = [
  ['/fixtures/05_DiagnosisReview.html', '샘플 · 진단검토형'],
  ['/fixtures/07_Matrix.html', '샘플 · 매트릭스형'],
];

export function DocRail({ api, saved, currentId }: { api: EditorApi; saved: SlideMeta[]; currentId: string }) {
  return (
    <nav className="ed-rail" data-area="rail">
      <span className="ed-label">샘플 장표</span>
      {FIXTURES.map(([url, label]) => (
        <button key={url} className="ed-rail__item" onClick={() => void api.importFromUrl(url)}>
          {label}
        </button>
      ))}

      <span className="ed-label">저장됨</span>
      {saved.length === 0 && <span className="ed-empty">아직 없음</span>}
      {saved.map((m) => (
        <button
          key={m.id}
          className="ed-rail__item"
          aria-current={m.id === currentId}
          onClick={() => void api.loadSaved(m.id)}
        >
          {m.title || '제목 없음'}
          <span className="ed-rail__meta">{m.updatedAt.slice(0, 16).replace('T', ' ')}</span>
        </button>
      ))}
    </nav>
  );
}
