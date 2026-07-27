/**
 * 툴바 — 액션 레지스트리에서 그대로 그린다.
 * 버튼 목록을 여기에 적지 않는다. actions.ts 에서 surfaces 에 'toolbar' 를 넣으면 여기 나타난다.
 */
import { useRef } from 'react';
import { grouped, type ActionCtx, type ActionDef } from './actions';
import type { EditorApi } from './editor';

export function Toolbar({ api, title, ctx }: { api: EditorApi; title: string; ctx: ActionCtx }) {
  const file = useRef<HTMLInputElement>(null);

  return (
    <div className="ed-toolbar" data-area="toolbar">
      <input
        className="ed-input ed-title"
        value={title}
        placeholder="제목 없음"
        onChange={(e) => api.setTitle(e.target.value)}
      />

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
      </div>

      {grouped('toolbar').map(([group, actions]) => (
        <div className="ed-group" key={group}>
          <span className="ed-sep" />
          <span className="ed-label">{group}</span>
          {actions.map((a) => <Btn key={a.id} action={a} ctx={ctx} />)}
        </div>
      ))}
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
