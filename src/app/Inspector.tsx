/**
 * 속성 패널 — 선택 요소의 위계·서식·배치, 위계 전역값, 검사 결과, 삭제 항목.
 * 색상 후보는 KG 브랜드 토큰 목록에서만 온다. 임의 hex 입력은 두지 않는다.
 */
import {
  MARKER_PRESETS, ROLES, ROLE_TOKENS,
  type ColorRef, type KgToken, type NodeId, type Role, type SlideDoc, type TextAlign,
} from '@contract/index';
import { isLocked, markerOf, type OverflowIssue } from '@core/index';
import type { EditorApi } from './editor';
import { ThemePanel } from './ThemePanel';

const TEXT_ALIGNS: [TextAlign, string][] = [
  ['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽'], ['justify', '양쪽'],
];
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900] as const;

export function Inspector({
  api, doc, selection, tokens, issues, roleOfNode, roleCounts,
}: {
  api: EditorApi;
  doc: SlideDoc;
  selection: NodeId[];
  tokens: KgToken[];
  issues: OverflowIssue[];
  /** 화면에 실제로 걸린 위계(자동 추론 결과 포함) */
  roleOfNode(id: NodeId): Role | null;
  roleCounts: Record<string, number>;
}) {
  const id = selection[0];
  const patch = id ? doc.patches[id] : undefined;
  const layout = patch?.layout;
  const detached = layout?.mode === 'detached';
  const locked = id ? isLocked(doc, id) : false;
  const role = id ? roleOfNode(id) : null;

  return (
    <aside className="ed-panel" data-area="panel">
      {!id && <p className="ed-empty">장표에서 요소를 클릭하면 속성이 나옵니다. 글자는 더블클릭(또는 F2)으로 편집합니다.</p>}

      {id && (
        <>
          <section className="ed-section">
            <h2 className="ed-section__title">선택 {selection.length > 1 ? `(${selection.length}개)` : ''}</h2>
            <div className="ed-field">
              <span className="ed-field__label">위계</span>
              <span className="ed-field__control">
                <select
                  className="ed-select"
                  value={role ?? ''}
                  onChange={(e) => api.run({
                    type: 'setRole', ids: selection, role: (e.target.value || null) as Role | null,
                  })}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_TOKENS[r].label}</option>)}
                </select>
                {patch?.role && (
                  <button
                    className="ed-btn"
                    title="자동 판정으로 되돌립니다"
                    onClick={() => api.run({ type: 'setRole', ids: selection, role: null })}
                  >자동</button>
                )}
              </span>
            </div>
            <div className="ed-field">
              <span className="ed-field__label">말머리표</span>
              <span className="ed-field__control">
                <select
                  className="ed-select"
                  value={patch?.style?.marker ?? (role ? markerOf(doc.theme, role) : '')}
                  onChange={(e) => api.styleSelected({ marker: e.target.value })}
                >
                  {MARKER_PRESETS.map(([value, label]) => (
                    <option key={label} value={value}>{value ? `${value}  ${label}` : label}</option>
                  ))}
                </select>
                <span className="ed-label">{patch?.style?.marker !== undefined ? '개별' : '위계 기본'}</span>
              </span>
            </div>
            <div className="ed-field">
              <span className="ed-field__label">배치</span>
              <span className="ed-field__control">
                {locked ? '잠김' : detached ? '떼어냄(절대좌표)' : '흐름 유지'}
              </span>
            </div>
            {detached && (
              <div className="ed-field">
                <span className="ed-field__label">위치·크기</span>
                <span className="ed-field__control">
                  {(['x', 'y', 'w', 'h'] as const).map((k) => (
                    <input
                      key={k}
                      className="ed-input ed-input--num"
                      type="number"
                      title={k}
                      value={layout?.[k] ?? 0}
                      onChange={(e) => api.run({ type: 'setRect', id, rect: { [k]: Number(e.target.value) } })}
                    />
                  ))}
                </span>
              </div>
            )}
          </section>

          <ColorField label="글자색" tokens={tokens} value={patch?.style?.color}
            onPick={(color) => api.styleSelected({ color })} />
          <ColorField label="배경" tokens={tokens} value={patch?.style?.background}
            onPick={(background) => api.styleSelected({ background })} />
          <ColorField label="테두리" tokens={tokens} value={patch?.style?.borderColor}
            onPick={(borderColor) => api.styleSelected({ borderColor })} />

          <section className="ed-section">
            <h2 className="ed-section__title">글자 (이 요소만)</h2>
            <p className="ed-note">여기서 바꾸면 위계 전역값을 따르지 않습니다. 되돌리려면 서식 초기화.</p>
            <div className="ed-field">
              <span className="ed-field__label">크기</span>
              <span className="ed-field__control">
                <input
                  className="ed-input ed-input--num"
                  type="number" min={8} max={96}
                  value={patch?.style?.fontSize ?? ''}
                  placeholder="위계 기본"
                  onChange={(e) => api.styleSelected({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
                />
                <span className="ed-label">px</span>
              </span>
            </div>
            <div className="ed-field">
              <span className="ed-field__label">굵기</span>
              <span className="ed-field__control">
                <select
                  className="ed-select"
                  value={patch?.style?.fontWeight ?? ''}
                  onChange={(e) => api.styleSelected({
                    fontWeight: e.target.value ? (Number(e.target.value) as (typeof WEIGHTS)[number]) : undefined,
                  })}
                >
                  <option value="">위계 기본</option>
                  {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </span>
            </div>
            <div className="ed-field">
              <span className="ed-field__label">문단 정렬</span>
              <span className="ed-field__control">
                {TEXT_ALIGNS.map(([a, label]) => (
                  <button key={a} className="ed-btn" aria-pressed={patch?.style?.textAlign === a}
                    onClick={() => api.styleSelected({ textAlign: a })}>{label}</button>
                ))}
              </span>
            </div>
            <button className="ed-btn" onClick={() => api.clearStyleSelected()}>서식 초기화</button>
          </section>
        </>
      )}

      <ThemePanel api={api} doc={doc} counts={roleCounts} />

      <section className="ed-section">
        <h2 className="ed-section__title">넘침 검사 ({issues.length})</h2>
        {issues.length === 0 && <p className="ed-note">박스를 벗어난 글자가 없습니다.</p>}
        {issues.slice(0, 12).map((i) => (
          <button key={i.id} className="ed-rail__item" onClick={() => api.select([i.id])}>
            {i.kind === 'clipped' ? '박스 안에서 잘림' : '장표 밖으로 벗어남'}
            <span className="ed-rail__meta">{i.preview || i.id} · {Math.round(i.overY || i.overX)}px</span>
          </button>
        ))}
        {issues.length > 0 && (
          <button className="ed-btn" onClick={() => api.fixOverflow()}>모두 보정</button>
        )}
      </section>

      {doc.tree.removed.length > 0 && (
        <section className="ed-section">
          <h2 className="ed-section__title">삭제한 요소 ({doc.tree.removed.length})</h2>
          <p className="ed-note">원본 요소는 지워도 문서에 남아 있습니다. 언제든 되살릴 수 있습니다.</p>
          {doc.tree.removed.map((rid) => (
            <div className="ed-field" key={rid}>
              <span className="ed-field__label">{rid}</span>
              <span className="ed-field__control">
                <button className="ed-btn" onClick={() => api.restore([rid])}>복원</button>
              </span>
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}

function ColorField({
  label, tokens, value, onPick,
}: {
  label: string;
  tokens: KgToken[];
  value?: ColorRef;
  onPick(ref: ColorRef): void;
}) {
  return (
    <section className="ed-section">
      <h2 className="ed-section__title">{label}</h2>
      <div className="ed-swatches">
        {tokens.map((t) => (
          <button
            key={t.name}
            className="ed-swatch"
            title={`${t.name} · ${t.value}`}
            aria-pressed={value === t.ref}
            style={{ ['--ed-swatch-color' as string]: t.value }}
            onClick={() => onPick(t.ref)}
          />
        ))}
      </div>
    </section>
  );
}
