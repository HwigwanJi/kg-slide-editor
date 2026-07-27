/**
 * 단축키 — 액션 레지스트리에서만 파생된다.
 *
 * 키 조합을 이 파일에 적지 않는다. actions.ts 의 shortcut 문자열이 유일한 진실이고,
 * 여기서는 눌린 키를 그 문자열로 바꿔 맞추기만 한다.
 * 그래서 "툴바에는 있는데 단축키가 다른" 상황이 생길 수 없다.
 */
import { ACTIONS, type ActionCtx, type ActionDef } from './actions';

/** 눌린 키 이벤트를 'Ctrl+Shift+C' 형태로 만든다. */
export function keyOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

const norm = (s: string) => s.toLowerCase().replace(/\s/g, '');

const INDEX = new Map<string, ActionDef>();
for (const a of ACTIONS) {
  if (a.shortcut && !INDEX.has(norm(a.shortcut))) INDEX.set(norm(a.shortcut), a);
}

export function findByKey(combo: string): ActionDef | undefined {
  return INDEX.get(norm(combo));
}

/**
 * 전역 키 처리기.
 * 글자 입력 중(편집기·입력칸)에는 편집 단축키가 가로채지 않도록 비켜선다.
 * 다만 저장·되돌리기처럼 어디서나 통해야 하는 것은 통과시킨다.
 */
const ALWAYS = new Set(['file.save', 'edit.undo', 'edit.redo', 'edit.redoAlt']);

export function installShortcuts(getCtx: () => ActionCtx): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const action = findByKey(keyOf(e));
    if (!action) return;

    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (typing && !ALWAYS.has(action.id)) return;

    const ctx = getCtx();
    if (action.enabled && !action.enabled(ctx)) {
      /*
       * 조건이 안 맞으면 아무 일도 일어나지 않는다 — 사람에게는 단축키가 고장 난 것으로 보인다.
       * 실제로 "Ctrl+G 가 안 먹는다" 는 말을 들었는데, 눌러 보면 동작은 멀쩡했고
       * 고른 것이 하나로 합쳐져 조건에 걸리지 않았을 뿐이었다.
       *
       * 막은 이유를 말해 준다. 기본 동작은 그대로 막는다 — 브라우저 찾기 창이 뜨면
       * 그것대로 놀란다.
       */
      e.preventDefault();
      ctx.api.notify(`${action.label} — ${action.hint ?? '지금은 쓸 수 없는 상태입니다'}`);
      return;
    }

    e.preventDefault();
    action.run(ctx);
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
