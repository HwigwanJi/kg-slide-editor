/**
 * 검사 탭 — 넘침을 맞춤법 검사처럼 하나씩 짚어 간다.
 *
 * 목록만 던져 주면 사람이 캔버스에서 그 요소를 다시 찾아야 한다. 그래서 이전/다음으로
 * 해당 장표까지 넘어가며 선택해 준다.
 *
 * 고침은 글자 축소 하나로 밀지 않는다. 자간·행간·여백·박스 높이 가운데 실제로 해결되는 것만
 * 후보로 올리고, 원본을 덜 건드리는 순으로 늘어놓는다.
 */
import { useEffect, useState } from 'react';
import type { SlideDoc } from '@contract/index';
import type { FixOption, OverflowIssue } from '@core/index';
import type { EditorApi } from '../editor';
import { BlindSection } from './BlindSection';

export function AuditTab({
  api, doc, selection, issues, onRescan, scanning, scope, onScope,
}: {
  api: EditorApi;
  doc: SlideDoc;
  selection: string[];
  issues: OverflowIssue[];
  onRescan(): void;
  scanning: boolean;
  scope: 'slide' | 'deck';
  onScope(s: 'slide' | 'deck'): void;
}) {
  const [at, setAt] = useState(0);
  const [options, setOptions] = useState<FixOption[]>([]);
  const current = issues[at];

  // 목록이 바뀌면 첫 항목부터 다시 본다.
  useEffect(() => { setAt(0); }, [issues]);

  useEffect(() => {
    let alive = true;
    if (!current) {
      setOptions([]);
      return;
    }
    void api.focusIssue(current).then(() => {
      if (alive) setOptions(api.fixOptions(current.id));
    });
    return () => { alive = false; };
  }, [api, current]);

  const move = (delta: number) => {
    if (issues.length === 0) return;
    setAt((v) => (v + delta + issues.length) % issues.length);
  };

  return (
    <>
      <section className="ed-section">
        <h2 className="ed-section__title">넘침 검사</h2>
        <div className="ed-field">
          <span className="ed-field__label">범위</span>
          <span className="ed-field__control">
            <button className="ed-btn" aria-pressed={scope === 'slide'} onClick={() => onScope('slide')}>이 장표</button>
            <button className="ed-btn" aria-pressed={scope === 'deck'} onClick={() => onScope('deck')}>전체 장표</button>
            <button className="ed-btn" disabled={scanning} onClick={onRescan}>
              {scanning ? '검사 중' : '다시 검사'}
            </button>
          </span>
        </div>

        {issues.length === 0 && (
          <p className="ed-note">{scanning ? '검사하고 있습니다.' : '박스를 벗어난 글자가 없습니다.'}</p>
        )}

        {current && (
          <>
            <div className="ed-stepper">
              <button className="ed-btn" onClick={() => move(-1)}>‹ 이전</button>
              <span className="ed-stepper__count">{at + 1} / {issues.length}</span>
              <button className="ed-btn" onClick={() => move(1)}>다음 ›</button>
            </div>
            <div className="ed-issue">
              <span className="ed-issue__kind" data-kind={current.kind}>
                {current.kind === 'clipped' ? '박스 안에서 잘림' : '장표 밖으로 벗어남'}
              </span>
              <span className="ed-issue__text">{current.preview || current.id}</span>
              <span className="ed-issue__meta">
                {current.overY > 0 && `세로 ${Math.round(current.overY)}px`}
                {current.overY > 0 && current.overX > 0 && ' · '}
                {current.overX > 0 && `가로 ${Math.round(current.overX)}px`}
              </span>
            </div>
          </>
        )}
      </section>

      {current && (
        <section className="ed-section">
          <h2 className="ed-section__title">고침 방법</h2>
          {options.length === 0 && (
            <p className="ed-note">
              글자·여백·박스 어느 쪽으로도 풀리지 않습니다. 내용을 줄이거나 배치를 바꿔야 합니다.
            </p>
          )}
          {options.map((o) => (
            <button
              key={o.kind}
              className="ed-fix"
              onClick={() => { api.applyFix(current.id, o); onRescan(); }}
            >
              <span className="ed-fix__label">{o.label}</span>
              <span className="ed-fix__change">{o.change}</span>
            </button>
          ))}
          <div className="ed-field">
            <span className="ed-field__label" />
            <span className="ed-field__control">
              <button className="ed-btn" onClick={() => move(1)}>건너뛰기</button>
              <button
                className="ed-btn ed-btn--primary"
                disabled={issues.length === 0}
                title="모든 항목을 가장 원본을 덜 건드리는 방법으로 고칩니다"
                onClick={() => { fixAll(api, issues); onRescan(); }}
              >모두 고침</button>
            </span>
          </div>
        </section>
      )}

      <BlindSection api={api} doc={doc} selection={selection} />
    </>
  );
}

/**
 * 모두 고침 — 항목마다 후보를 다시 재서 가장 값싼 방법을 쓴다.
 * 한 항목을 고치면 주변 배치가 달라져 다음 항목의 답도 달라지므로, 매번 다시 잰다.
 */
function fixAll(api: EditorApi, issues: OverflowIssue[]): void {
  for (const issue of issues) {
    const best = api.fixOptions(issue.id)[0];
    if (best) api.applyFix(issue.id, best);
  }
}
