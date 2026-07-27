/**
 * 폴더 고르기 약속 — 명령형(editor.ts)과 선언형(FolderPicker.tsx) 사이의 다리.
 *
 * editor.ts 가 requestFolder() 를 부르면 창이 열리고, 사람이 고르면 그 약속이 풀린다.
 * 띄우는 쪽과 기다리는 쪽이 서로를 모르는 채로 붙는다.
 *
 * **이 조각이 컴포넌트 파일과 갈라져 있는 이유가 있다.** React Fast Refresh 는 한 모듈이
 * 컴포넌트만 내보낼 때만 동작한다. 컴포넌트와 보통 함수를 같이 내보내면 갱신을 포기하고
 * 모듈을 통째로 무효화하는데, 그러면 아래 두 변수가 초기화되어 열려 있던 약속이 영영 풀리지
 * 않는다. 사람 눈에는 "프로젝트 열기를 눌렀더니 앱이 죽었다" 로 보인다.
 */
type Resolve = (path: string | null) => void;

/** 답을 기다리는 자리. 창은 한 번에 하나만 뜬다. */
let pending: Resolve | null = null;
/** 창을 여닫는 손잡이. 컴포넌트가 붙으면서 맡긴다. */
let toggle: ((on: boolean) => void) | null = null;

/** 컴포넌트가 자기를 등록한다. 끊을 때 부르는 함수를 돌려준다. */
export function registerFolderPicker(fn: (on: boolean) => void): () => void {
  toggle = fn;
  return () => { toggle = null; };
}

/** editor.ts 가 부른다. 사람이 고르면 경로, 닫으면 null. */
export function requestFolder(): Promise<string | null> {
  if (!toggle) return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    pending = resolve;
    toggle?.(true);
  });
}

/** 컴포넌트가 사람의 답을 넘긴다. */
export function answerFolder(path: string | null): void {
  pending?.(path);
  pending = null;
}

/* ---------- 최근 연 폴더 ---------- */

const RECENT_KEY = 'kg-slide-editor/recent-folders';
const RECENT_MAX = 6;

export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(path: string): void {
  const next = [path, ...readRecent().filter((p) => p !== path)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 저장 못 해도 동작한다 */ }
}

/** 사라진 폴더는 목록에서 뺀다. 없는 곳을 계속 권하면 열 때마다 같은 오류를 본다. */
export function forgetRecent(path: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(readRecent().filter((p) => p !== path)));
  } catch { /* 못 지워도 동작한다 */ }
}
