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
import { isLocked, markerOf, type Neighbor, type NeighborKind } from '@core/index';
import type { EditorApi } from '../editor';
import { ObjectThumb } from './ObjectThumb';

type KindFilter = NeighborKind | 'all';

const KIND_FILTERS: [KindFilter, string][] = [
  ['all', '전체'], ['text', '글자'], ['shape', '도형'], ['group', '묶음'],
];
/** 목록에서 종류를 한눈에 구분하기 위한 표시 */
const KIND_MARK: Record<NeighborKind, string> = { text: '가', shape: '◇', group: '▣' };
const KIND_NAME: Record<NeighborKind, string> = { text: '글자', shape: '도형', group: '묶음' };

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
  const [filter, setFilter] = useState<KindFilter>('all');
  const id = selection[0];

  const counts: Record<NeighborKind, number> = {
    text: neighbors.filter((n) => n.kind === 'text').length,
    shape: neighbors.filter((n) => n.kind === 'shape').length,
    group: neighbors.filter((n) => n.kind === 'group').length,
  };
  const shown = filter === 'all' ? neighbors : neighbors.filter((n) => n.kind === filter);

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
            <span className="ed-label">{patch?.style?.marker !== undefined ? '이 항목만 개별' : '위계 기본'}</span>
          </span>
        </div>

        <div className="ed-field">
          <span className="ed-field__label">배치 방식</span>
          <span className="ed-field__control">
            <button
              className="ed-btn" aria-pressed={!detached}
              title="KG 레이아웃이 위치와 크기를 정합니다. 옆 요소가 바뀌면 따라 움직입니다"
              onClick={() => api.reflowSelected()}
            >자동 배치</button>
            <button
              className="ed-btn" aria-pressed={detached}
              title="원하는 자리에 고정합니다. 끌어서 옮기고 크기를 조절할 수 있습니다"
              onClick={() => api.detachSelected()}
            >자유 배치</button>
          </span>
        </div>
        <p className="ed-note">
          {detached
            ? '자유 배치 — 좌표로 고정되어 있습니다. 끌어서 옮기고 크기를 조절할 수 있습니다. 원래 자리는 비워 둔 채입니다.'
            : '자동 배치 — KG 레이아웃이 위치와 크기를 정합니다. 자유롭게 옮기려면 자유 배치로 바꾸세요.'}
        </p>

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
        <h2 className="ed-section__title">주변 오브젝트 ({shown.length})</h2>
        <p className="ed-note">
          클릭하면 그것으로 바꾸고, Ctrl+클릭하면 선택에 더합니다.
          연결선·도형처럼 캔버스에서 집기 어려운 것도 여기서 잡습니다.
        </p>
        <div className="ed-field__control">
          {KIND_FILTERS.map(([value, label]) => (
            <button
              key={label} className="ed-btn"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >{label}{value !== 'all' && ` ${counts[value]}`}</button>
          ))}
        </div>
        <ul className="ed-neighbors">
          {shown.map((n) => (
            <li key={n.id}>
              <button
                className="ed-neighbor"
                aria-pressed={selection.includes(n.id)}
                onClick={(e) => api.select(
                  e.ctrlKey || e.metaKey ? [...new Set([...selection, n.id])] : [n.id],
                )}
              >
                <span className="ed-neighbor__rel" data-kind={n.kind}>{KIND_MARK[n.kind]}</span>
                <span className="ed-neighbor__label">{n.label}</span>
                <span className="ed-neighbor__meta">
                  {n.relation} · {n.role ? ROLE_TOKENS[n.role].label : KIND_NAME[n.kind]} · {n.rect.w}×{n.rect.h}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="ed-note">해당하는 요소가 없습니다.</p>}
      </section>
    </>
  );
}
