/**
 * 위계 설정 — 문서 전역값.
 *
 * 여기서 바꾼 값은 "개별로 손대지 않은 요소"에만 걸린다. 개별 오버라이드가 항상 이긴다.
 * 위계마다 지금 장표에 몇 개가 걸려 있는지 함께 보여 준다 — 조정이 어디에 닿는지 알아야
 * 안심하고 만질 수 있다.
 */
import { MARKER_PRESETS, ROLES, ROLE_TOKENS, type Role, type SlideDoc } from '@contract/index';
import { isRoleTouched, markerOf } from '@core/index';
import type { EditorApi } from './editor';

export function ThemePanel({
  api, doc, counts,
}: {
  api: EditorApi;
  doc: SlideDoc;
  counts: Record<string, number>;
}) {
  return (
    <section className="ed-section">
      <h2 className="ed-section__title">위계 전역값</h2>
      <p className="ed-note">
        개별로 손댄 요소는 여기 조정을 따르지 않습니다. 되돌리려면 그 요소에서 서식 초기화.
      </p>

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

      <table className="ed-roles">
        <thead>
          <tr>
            <th>위계</th><th>수</th><th>크기</th><th>굵기</th><th>말머리표</th><th />
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => (
            <RoleRow key={role} api={api} doc={doc} role={role} count={counts[role] ?? 0} />
          ))}
        </tbody>
      </table>

      <button className="ed-btn" onClick={() => api.resetTheme()}>위계 전역값 전체 초기화</button>
    </section>
  );
}

function RoleRow({
  api, doc, role, count,
}: {
  api: EditorApi;
  doc: SlideDoc;
  role: Role;
  count: number;
}) {
  const s = doc.theme.roles?.[role] ?? {};
  const touched = isRoleTouched(doc.theme, role);
  const marker = markerOf(doc.theme, role);

  return (
    <tr data-empty={count === 0 ? '' : undefined}>
      <th scope="row" title={`KG 토큰 ${ROLE_TOKENS[role].size}`}>{ROLE_TOKENS[role].label}</th>
      <td className="ed-roles__count">{count}</td>
      <td>
        <input
          className="ed-input ed-input--num"
          type="number" min={8} max={96}
          value={s.fontSize ?? ''}
          placeholder="기본"
          onChange={(e) => api.setRoleStyle(role, {
            ...s, fontSize: e.target.value ? Number(e.target.value) : undefined,
          })}
        />
      </td>
      <td>
        <select
          className="ed-select"
          value={s.fontWeight ?? ''}
          onChange={(e) => api.setRoleStyle(role, {
            ...s, fontWeight: e.target.value ? (Number(e.target.value) as 700) : undefined,
          })}
        >
          <option value="">기본</option>
          {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </td>
      <td>
        <select
          className="ed-select"
          value={marker}
          onChange={(e) => api.setRoleStyle(role, { ...s, marker: e.target.value })}
        >
          {MARKER_PRESETS.map(([value, label]) => (
            <option key={label} value={value}>{value ? `${value}  ${label}` : label}</option>
          ))}
        </select>
      </td>
      <td>
        <button
          className="ed-btn"
          disabled={!touched}
          title="이 위계의 전역 조정을 초기값으로 되돌립니다"
          onClick={() => api.setRoleStyle(role, null)}
        >
          초기화
        </button>
      </td>
    </tr>
  );
}
