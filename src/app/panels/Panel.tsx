/**
 * 오른쪽 패널 — 탭으로 큰 모듈을 나눈다.
 *
 * 선택 → 서식 → 위계 순으로 좁혀 간다. 메인 편집(무엇을 고르고 어디 둘지)과
 * 세부 편집(값을 얼마로 할지)을 한 화면에 쌓아 두면 어느 것이 지금 할 일인지 흐려진다.
 * 검사는 성격이 달라 끝에 따로 둔다.
 */
import { ROLE_TOKENS, type KgToken, type NodeId, type Role, type SlideDoc } from '@contract/index';
import type { Neighbor, OverflowIssue } from '@core/index';
import type { EditorApi } from '../editor';
import { AuditTab } from './AuditTab';
import { FormatTab } from './FormatTab';
import { HierarchyTab, type RoleMetrics } from './HierarchyTab';
import { SelectionTab } from './SelectionTab';

export type TabId = 'selection' | 'format' | 'hierarchy' | 'audit';

const TABS: [TabId, string][] = [
  ['selection', '선택'], ['format', '서식'], ['hierarchy', '위계'], ['audit', '검사'],
];

export function Panel(props: {
  api: EditorApi;
  doc: SlideDoc;
  selection: NodeId[];
  tokens: KgToken[];
  neighbors: Neighbor[];
  roleOfNode(id: NodeId): Role | null;
  roleCounts: Record<string, number>;
  roleMetrics: RoleMetrics;
  issues: OverflowIssue[];
  scanning: boolean;
  scope: 'slide' | 'deck';
  minFontSize: number;
  tab: TabId;
  onTab(t: TabId): void;
  onRescan(): void;
  onScope(s: 'slide' | 'deck'): void;
}) {
  const { api, doc, selection, tab, onTab } = props;
  const activeRole = selection[0] ? props.roleOfNode(selection[0]) : null;

  return (
    <aside className="ed-panel" data-area="panel">
      <div className="ed-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className="ed-tab"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
          >
            {label}
            {id === 'audit' && props.issues.length > 0 && (
              <span className="ed-tab__badge">{props.issues.length}</span>
            )}
            {id === 'selection' && selection.length > 0 && (
              <span className="ed-tab__badge ed-tab__badge--quiet">{selection.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* 지금 고른 것이 무엇인지 탭을 옮겨도 잃지 않게 머리에 고정한다 */}
      {selection[0] && (
        <div className="ed-panel__crumb">
          <span className="ed-panel__role">{activeRole ? ROLE_TOKENS[activeRole].label : '위계 없음'}</span>
          <span className="ed-panel__id">{selection[0]}</span>
        </div>
      )}

      <div className="ed-panel__body" role="tabpanel">
        {tab === 'selection' && (
          <SelectionTab
            api={api} doc={doc} selection={selection}
            neighbors={props.neighbors} roleOfNode={props.roleOfNode}
          />
        )}
        {tab === 'format' && (
          <FormatTab
            api={api} doc={doc} selection={selection}
            tokens={props.tokens} minFontSize={props.minFontSize}
          />
        )}
        {tab === 'hierarchy' && (
          <HierarchyTab
            api={api} doc={doc} counts={props.roleCounts} metrics={props.roleMetrics}
            activeRole={activeRole} minFontSize={props.minFontSize}
          />
        )}
        {tab === 'audit' && (
          <AuditTab
            api={api} issues={props.issues} onRescan={props.onRescan}
            scanning={props.scanning} scope={props.scope} onScope={props.onScope}
          />
        )}
      </div>
    </aside>
  );
}
