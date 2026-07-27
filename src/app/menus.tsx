/**
 * 액션 노출면 세 가지 — 우클릭 메뉴 · 버블 툴바 · 명령 목록.
 * 셋 다 actions.ts 한 배열에서 파생된다. 여기에는 무엇을 보여줄지 고르는 기준만 있다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIONS, grouped, surface, type ActionCtx, type ActionDef } from './actions';

function run(action: ActionDef, ctx: ActionCtx, after?: () => void) {
  if (action.enabled && !action.enabled(ctx)) return;
  action.run(ctx);
  after?.();
}

function Item({ action, ctx, onDone }: { action: ActionDef; ctx: ActionCtx; onDone?: () => void }) {
  const disabled = action.enabled ? !action.enabled(ctx) : false;
  return (
    <button
      className={`ed-menu__item${action.danger ? ' ed-menu__item--danger' : ''}`}
      disabled={disabled}
      title={action.hint}
      onClick={() => run(action, ctx, onDone)}
    >
      <span className="ed-menu__label">{action.label}</span>
      {action.shortcut && <kbd className="ed-menu__key">{action.shortcut}</kbd>}
    </button>
  );
}

/* ---------------- 우클릭 메뉴 ---------------- */

export interface MenuPoint { x: number; y: number }

export function ContextMenu({ at, ctx, onClose }: { at: MenuPoint | null; ctx: ActionCtx; onClose(): void }) {
  useEffect(() => {
    if (!at) return;
    const close = () => onClose();
    window.addEventListener('pointerdown', close, { capture: true });
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close, { capture: true });
      window.removeEventListener('blur', close);
    };
  }, [at, onClose]);

  if (!at) return null;
  return (
    <div className="ed-menu" style={{ left: at.x, top: at.y }} onPointerDown={(e) => e.stopPropagation()}>
      {grouped('context').map(([group, actions], i) => (
        <div className="ed-menu__group" key={group}>
          {i > 0 && <div className="ed-menu__sep" />}
          {actions.map((a) => <Item key={a.id} action={a} ctx={ctx} onDone={onClose} />)}
        </div>
      ))}
    </div>
  );
}

/* ---------------- 버블 툴바 ---------------- */

/** 선택한 요소 위에 떠오르는 도구. 자주 쓰는 것만 담는다. */
export function BubbleToolbar({ anchor, ctx }: { anchor: DOMRect | null; ctx: ActionCtx }) {
  if (!anchor || ctx.count === 0) return null;
  const actions = surface('bubble');
  return (
    <div className="ed-bubble" style={{ left: anchor.left + anchor.width / 2, top: anchor.top - 8 }}>
      {actions.map((a) => (
        <button
          key={a.id}
          className="ed-bubble__btn"
          disabled={a.enabled ? !a.enabled(ctx) : false}
          title={a.hint ? `${a.label} — ${a.hint}` : a.label}
          onClick={() => run(a, ctx)}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- 명령 목록 ---------------- */

/**
 * 모든 기능이 한 곳에 나오는 목록. 툴바에 자리가 없어 숨은 기능도 여기서는 반드시 보인다.
 * "화면 어디에도 없는 기능"이 생기지 않게 하는 마지막 안전장치다.
 */
export function CommandPalette({ open, ctx, onClose }: { open: boolean; ctx: ActionCtx; onClose(): void }) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      input.current?.focus();
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = ACTIONS.filter((a) => a.surfaces.includes('palette'));
    if (!q) return list;
    return list.filter((a) =>
      `${a.label} ${a.group} ${a.shortcut ?? ''} ${a.hint ?? ''}`.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;
  return (
    <div className="ed-palette__scrim" onPointerDown={onClose}>
      <div className="ed-palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="ed-palette__input"
          placeholder="명령 찾기"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && matches[0]) run(matches[0], ctx, onClose);
          }}
        />
        <div className="ed-palette__list">
          {matches.map((a) => (
            <Item key={a.id} action={a} ctx={ctx} onDone={onClose} />
          ))}
          {matches.length === 0 && <p className="ed-empty">해당하는 명령 없음</p>}
        </div>
      </div>
    </div>
  );
}
