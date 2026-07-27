/**
 * 상단 리본 — 2단.
 *
 * 위 줄에서 무엇을 할지 고르고, 아래 줄에서 그 도구를 쓴다.
 * 한 줄에 모든 도구를 늘어놓으면 가로로 넘쳐 뒤쪽 도구는 존재조차 보이지 않는다.
 *
 * 어떤 도구가 어느 탭에 있는지는 액션의 group 이 정한다. 여기서 목록을 다시 쓰지 않는다.
 */
import { useRef } from 'react';
import { surface, type ActionCtx, type ActionDef, type ActionGroup } from './actions';
import type { EditorApi } from './editor';

export type RibbonTab = '홈' | '프로젝트' | '슬라이드' | '삽입' | '배치' | '서식' | '검사';

/** 리본 탭 ↔ 액션 그룹. 한 탭이 여러 그룹을 담을 수 있다. */
const TAB_GROUPS: Record<RibbonTab, ActionGroup[]> = {
  홈: ['파일', '편집'],
  프로젝트: ['프로젝트'],
  슬라이드: ['슬라이드'],
  삽입: ['삽입', '글자'],
  배치: ['배치', '정렬', '순서'],
  서식: ['서식'],
  검사: ['선택', '검사', '위계', '보기'],
};

const TABS = Object.keys(TAB_GROUPS) as RibbonTab[];

export function Toolbar({
  api, title, ctx, tab, onTab,
}: {
  api: EditorApi;
  title: string;
  ctx: ActionCtx;
  tab: RibbonTab;
  onTab(t: RibbonTab): void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const groups = TAB_GROUPS[tab];

  return (
    <div className="ed-ribbon" data-area="toolbar">
      <div className="ed-ribbon__top">
        <input
          className="ed-input ed-title"
          value={title}
          placeholder="제목 없음"
          onChange={(e) => api.setTitle(e.target.value)}
        />

        <nav className="ed-ribbon__tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              className="ed-ribbon__tab"
              role="tab"
              aria-selected={tab === t}
              onClick={() => onTab(t)}
            >{t}</button>
          ))}
        </nav>

        <div className="ed-group ed-ribbon__quick">
          <button
            className="ed-btn"
            title="장표 HTML 을 프로젝트에 넣습니다. 여러 개를 한 번에 고를 수 있고, 파일 이름순으로 들어갑니다"
            onClick={() => file.current?.click()}
          >적재</button>
          <input
            ref={file}
            type="file"
            multiple
            accept=".html,.htm,.json,.kgslide"
            className="ed-visually-hidden"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length) void api.importFiles(files);
              e.target.value = '';
            }}
          />
          <button className="ed-btn ed-btn--primary" onClick={() => void api.save()}>저장</button>
        </div>
      </div>

      <div className="ed-ribbon__body" role="tabpanel">
        {groups.map((group, i) => {
          const actions = surface('toolbar').filter((a) => a.group === group);
          if (actions.length === 0) return null;
          return (
            <div className="ed-ribbon__group" key={group}>
              {i > 0 && <span className="ed-sep" />}
              <span className="ed-label">{group}</span>
              {actions.map((a) => <Btn key={a.id} action={a} ctx={ctx} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Btn({ action, ctx }: { action: ActionDef; ctx: ActionCtx }) {
  const disabled = action.enabled ? !action.enabled(ctx) : false;
  const title = [action.label, action.shortcut, action.hint].filter(Boolean).join(' · ');
  return (
    <button
      className={`ed-btn${action.danger ? ' ed-btn--danger' : ''}`}
      disabled={disabled}
      title={title}
      onClick={() => action.run(ctx)}
    >
      {action.label}
    </button>
  );
}
