/**
 * 위계 탭 — 문서 전역값.
 *
 * 조정한 값이 어디에 닿는지 보이지 않으면 만지기 무섭다. 그래서 위계마다
 *  - 지금 장표에 몇 개가 걸려 있는지
 *  - 실제로 화면에 나오는 크기가 몇 px 인지 (설정 칸이 비어 있어도)
 *  - 지금 고른 요소가 어느 위계인지
 * 를 함께 보여 준다.
 */
import {
  MARKER_PRESETS, ROLES, ROLE_TOKENS, type Role, type SlideDoc,
} from '@contract/index';
import { isRoleTouched, markerOf } from '@core/index';
import type { EditorApi } from '../editor';

export type RoleMetrics = Record<string, { fontSize: number; fontWeight: number; color: string }>;

export function HierarchyTab({
  api, doc, counts, metrics, activeRole, minFontSize,
}: {
  api: EditorApi;
  doc: SlideDoc;
  counts: Record<string, number>;
  metrics: RoleMetrics;
  activeRole: Role | null;
  minFontSize: number;
}) {
  return (
    <>
      <section className="ed-section">
        <h2 className="ed-section__title">전체 배율</h2>
        <p className="ed-note">개별로 손댄 요소는 따르지 않습니다. 되돌리려면 그 요소에서 서식 초기화.</p>
        <div className="ed-field">
          <span className="ed-field__label">배율</span>
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
      </section>

      <section className="ed-section">
        <h2 className="ed-section__title">위계별 설정</h2>
        <ul className="ed-roles">
          {ROLES.map((role) => {
            const s = doc.theme.roles?.[role] ?? {};
            const m = metrics[role];
            const count = counts[role] ?? 0;
            const tooSmall = !!m && m.fontSize < minFontSize;

            return (
              <li
                key={role}
                className="ed-role"
                data-active={activeRole === role ? '' : undefined}
                data-empty={count === 0 ? '' : undefined}
              >
                <div className="ed-role__head">
                  <span className="ed-role__name" title={`KG 토큰 ${ROLE_TOKENS[role].size}`}>
                    {ROLE_TOKENS[role].label}
                  </span>
                  <span className="ed-role__now" data-warn={tooSmall ? '' : undefined}>
                    {m ? `${m.fontSize}px · ${m.fontWeight}` : '미사용'}
                  </span>
                  <span className="ed-role__count">{count}</span>
                </div>

                <div className="ed-role__ctrls">
                  <label className="ed-num">
                    <span>크기</span>
                    <input
                      className="ed-input ed-input--num"
                      type="number" min={8} max={96}
                      value={s.fontSize ?? ''}
                      placeholder={m ? String(m.fontSize) : '기본'}
                      onChange={(e) => api.setRoleStyle(role, {
                        ...s, fontSize: e.target.value ? Number(e.target.value) : undefined,
                      })}
                    />
                  </label>
                  <select
                    className="ed-select"
                    value={s.fontWeight ?? ''}
                    onChange={(e) => api.setRoleStyle(role, {
                      ...s, fontWeight: e.target.value ? (Number(e.target.value) as 700) : undefined,
                    })}
                  >
                    <option value="">굵기</option>
                    {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <select
                    className="ed-select"
                    value={markerOf(doc.theme, role)}
                    onChange={(e) => api.setRoleStyle(role, { ...s, marker: e.target.value })}
                  >
                    {MARKER_PRESETS.map(([value, label]) => (
                      <option key={label} value={value}>{value ? `${value} ${label}` : '말머리표 없음'}</option>
                    ))}
                  </select>
                  <button
                    className="ed-btn"
                    disabled={!isRoleTouched(doc.theme, role)}
                    title="이 위계의 전역 조정을 초기값으로 되돌립니다"
                    onClick={() => api.setRoleStyle(role, null)}
                  >초기화</button>
                </div>

                {tooSmall && (
                  <p className="ed-note ed-note--warn">
                    프로젝트 최소 크기({minFontSize}px)보다 작습니다.
                    <button className="ed-btn" onClick={() => api.setRoleStyle(role, { ...s, fontSize: minFontSize })}>
                      {minFontSize}px 로 올리기
                    </button>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <button className="ed-btn" onClick={() => api.resetTheme()}>전역값 전체 초기화</button>
      </section>
    </>
  );
}
