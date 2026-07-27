/**
 * 툴바 — 자리와 배선만. 아이콘·모양은 프론트 단계에서 교체한다.
 * 규칙: 이 파일은 editor.ts 가 노출한 동작만 부른다. 문서를 직접 만지지 않는다.
 */
import { useRef } from 'react';
import type { ObjectAlign } from '@contract/index';
import type { EditorApi } from './editor';

const ALIGNS: [ObjectAlign, string][] = [
  ['left', '좌'], ['hcenter', '가운데'], ['right', '우'],
  ['top', '상'], ['vcenter', '중간'], ['bottom', '하'],
];

const ORDERS: ['front' | 'back' | 'forward' | 'backward', string][] = [
  ['front', '맨 앞'], ['forward', '앞으로'], ['backward', '뒤로'], ['back', '맨 뒤'],
];

export function Toolbar({ api, title, selected }: { api: EditorApi; title: string; selected: number }) {
  const file = useRef<HTMLInputElement>(null);
  const none = selected === 0;

  return (
    <div className="ed-toolbar" data-area="toolbar">
      <span className="ed-title">{title || '제목 없음'}</span>
      <span className="ed-sep" />

      <div className="ed-group">
        <button className="ed-btn" onClick={() => file.current?.click()}>열기</button>
        <input
          ref={file}
          type="file"
          accept=".html,.htm,.json"
          className="ed-visually-hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void api.importFile(f);
            e.target.value = '';
          }}
        />
        <button className="ed-btn ed-btn--primary" onClick={() => void api.save()}>저장</button>
        <button className="ed-btn" onClick={() => api.exportHtml()}>HTML</button>
        <button className="ed-btn" onClick={() => api.exportJson()}>JSON</button>
      </div>

      <span className="ed-sep" />
      <div className="ed-group">
        <button className="ed-btn" onClick={() => api.undo()}>되돌리기</button>
        <button className="ed-btn" onClick={() => api.redo()}>다시</button>
      </div>

      <span className="ed-sep" />
      <div className="ed-group">
        <span className="ed-label">배치</span>
        <button className="ed-btn" disabled={none} onClick={() => api.detachSelected()}>떼어내기</button>
        <button className="ed-btn" disabled={none} onClick={() => api.reflowSelected()}>흐름 복귀</button>
      </div>

      <span className="ed-sep" />
      <div className="ed-group">
        <span className="ed-label">정렬</span>
        {ALIGNS.map(([edge, label]) => (
          <button key={edge} className="ed-btn" disabled={selected < 2} onClick={() => api.alignSelected(edge)}>
            {label}
          </button>
        ))}
      </div>

      <span className="ed-sep" />
      <div className="ed-group">
        <span className="ed-label">순서</span>
        {ORDERS.map(([op, label]) => (
          <button key={op} className="ed-btn" disabled={none} onClick={() => api.orderSelected(op)}>
            {label}
          </button>
        ))}
      </div>

      <span className="ed-sep" />
      <div className="ed-group">
        <span className="ed-label">보기</span>
        <button className="ed-btn" onClick={() => api.setZoom('fit')}>맞춤</button>
        <button className="ed-btn" onClick={() => api.setZoom(1)}>100%</button>
      </div>
    </div>
  );
}
