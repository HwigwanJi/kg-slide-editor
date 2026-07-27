/**
 * 위계 설정 — 문서 전역값.
 *
 * 여기서 바꾼 값은 "개별로 손대지 않은 요소"에만 걸린다. 개별 오버라이드가 항상 이긴다.
 * 그래서 위계별 줄에는 지금 몇 개가 전역을 따르고 몇 개가 따로 노는지 함께 보여 준다.
 */
import { ROLE_TOKENS, type Role, type SlideDoc } from '@contract/index';
import { isRoleTouched } from '@core/index';
import type { EditorApi } from './editor';

const ROLES = Object.keys(ROLE_TOKENS) as Role[];

export function ThemePanel({ api, doc }: { api: EditorApi; doc: SlideDoc }) {
  return (
    <section className="ed-section">
      <h2 className="ed-section__title">위계 전역값</h2>

      <div className="ed-field">
        <span className="ed-field__label">전체 배율</span>
        <span className="ed-field__control">
          <input
            className="ed-range"
            type="range" min={0.8} max={1.3} step={0.01}
            value={doc.theme.scale}
            onChange={(e) => api.setThemeScale(Number(e.target.value))}
          />
          <span className="ed-label">{Math.round(doc.theme.scale * 100)}%</span>
        </span>
      </div>

      {ROLES.map((role) => {
        const s = doc.theme.roles?.[role] ?? {};
        const touched = isRoleTouched(doc.theme, role);
        return (
          <div className="ed-field" key={role}>
            <span className="ed-field__label" title={`토큰 ${ROLE_TOKENS[role].size}`}>
              {ROLE_TOKENS[role].label}
            </span>
            <span className="ed-field__control">
              <input
                className="ed-input ed-input--num"
                type="number" min={8} max={96}
                value={s.fontSize ?? ''}
                placeholder="기본"
                onChange={(e) => api.setRoleStyle(role, {
                  ...s,
                  fontSize: e.target.value ? Number(e.target.value) : undefined,
                })}
              />
              <select
                className="ed-select"
                value={s.fontWeight ?? ''}
                onChange={(e) => api.setRoleStyle(role, {
                  ...s,
                  fontWeight: e.target.value ? (Number(e.target.value) as 700) : undefined,
                })}
              >
                <option value="">굵기</option>
                {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <button
                className="ed-btn"
                disabled={!touched}
                title="이 위계의 전역 조정을 초기값으로 되돌립니다"
                onClick={() => api.setRoleStyle(role, null)}
              >
                초기화
              </button>
            </span>
          </div>
        );
      })}

      <button className="ed-btn" onClick={() => api.resetTheme()}>위계 전역값 전체 초기화</button>
    </section>
  );
}
