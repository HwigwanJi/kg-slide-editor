/**
 * 선택 탭 — 메인 편집.
 * 지금 무엇을 고르고 있는지 확인하고, 무엇을 고를지 바꾸고, 위계·배치를 손본다.
 * 색·글꼴 같은 세부는 서식 탭으로 넘긴다.
 */
import { useState } from 'react';
import {
  MARKER_PRESETS, ROLES, ROLE_TOKENS,
  type Anchor, type NodeId, type Role, type SlideDoc,
} from '@contract/index';
import { isLocked, markerOf, type Neighbor } from '@core/index';
import type { EditorApi } from '../editor';
import { ObjectThumb } from './ObjectThumb';

export function SelectionTab({
  api, doc, selection, neighbors, roleOfNode,
}: {
  api: EditorApi;
  doc: SlideDoc;
  selection: NodeId[];
  neighbors: Neighbor[];
  roleOfNode(id: NodeId): Role | null;
}) {
  const [anchor, setAnchor] = useState<Anchor>('c');
  const id = selection[0];

  if (!id) {
    return (
      <p className="ed-empty">
        장표에서 요소를 클릭하면 여기에 나옵니다.<br />
        글자는 더블클릭 또는 F2 로 편집합니다.
      </p>
    );
  }

  const patch = doc.patches[id];
  const layout = patch?.layout;
  const detached = layout?.mode === 'detached';
  const locked = isLocked(doc, id);
  const role = roleOfNode(id);

  return (
    <>
      <ObjectThumb api={api} selection={selection} anchor={anchor} onAnchor={setAnchor} detached={detached} />

      <section className="ed-section">
        <h2 className="ed-section__title">
          선택{selection.length > 1 ? ` · ${selection.length}개` : ''}
          {locked && <span className="ed-badge">잠김</span>}
        </h2>

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
            {patch?.role
              ? <button className="ed-btn" title="자동 판정으로 되돌립니다"
                  onClick={() => api.run({ type: 'setRole', ids: selection, role: null })}>자동</button>
              : <span className="ed-label">자동</span>}
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
            <button className="ed-btn" aria-pressed={!detached} onClick={() => api.reflowSelected()}>흐름</button>
            <button className="ed-btn" aria-pressed={detached} onClick={() => api.detachSelected()}>떼어냄</button>
          </span>
        </div>

        {detached && (
          <div className="ed-field">
            <span className="ed-field__label">위치·크기</span>
            <span className="ed-field__control ed-field__control--wrap">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k} className="ed-num">
                  <span>{k}</span>
                  <input
                    className="ed-input ed-input--num"
                    type="number"
                    value={layout?.[k] ?? 0}
                    onChange={(e) => api.run({ type: 'setRect', id, rect: { [k]: Number(e.target.value) } })}
                  />
                </label>
              ))}
            </span>
          </div>
        )}
      </section>

      <section className="ed-section">
        <h2 className="ed-section__title">주변 오브젝트 ({neighbors.length})</h2>
        <p className="ed-note">클릭하면 그것으로 바꾸고, Ctrl+클릭하면 선택에 더합니다.</p>
        <ul className="ed-neighbors">
          {neighbors.map((n) => (
            <li key={n.id}>
              <button
                className="ed-neighbor"
                aria-pressed={selection.includes(n.id)}
                onClick={(e) => api.select(
                  e.ctrlKey || e.metaKey ? [...new Set([...selection, n.id])] : [n.id],
                )}
              >
                <span className="ed-neighbor__rel">{n.relation}</span>
                <span className="ed-neighbor__label">{n.label}</span>
                <span className="ed-neighbor__meta">
                  {n.role ? ROLE_TOKENS[n.role].label : '—'} · {n.rect.w}×{n.rect.h}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {neighbors.length === 0 && <p className="ed-note">주변에 잡을 요소가 없습니다.</p>}
      </section>
    </>
  );
}
