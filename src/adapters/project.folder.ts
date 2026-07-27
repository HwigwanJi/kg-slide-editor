/**
 * 폴더 저장소 — File System Access API.
 *
 * 이것이 실제 작업 방식이다. Claude Code 가 폴더에 장표 파일을 만들면 편집기가 그 폴더를 열어
 * 그대로 이어서 다듬는다. 사람이 파일탐색기에서 보고, git 에 올리고, 남에게 넘길 수 있다.
 *
 * Chromium 계열에서만 동작한다. 지원하지 않는 브라우저에서는 브라우저 저장소로 물러난다.
 */
import {
  DECK_FILE, DEFAULT_SETTINGS, PREVIEW_DIR, SETTINGS_FILE, SLIDES_DIR, assertSlideDoc, createDeck,
  parseDeck, parseSettings, parseSlideDoc, previewFileName, slideFileName,
} from '@contract/index';
import { projectNameFrom, type ProjectAdapter } from './project';

/** lib.dom 에 아직 없는 부분만 좁게 선언한다. */
interface DirectoryPickerWindow {
  showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}

type PermissionArgs = { mode?: 'read' | 'readwrite' };
interface PermissionedHandle {
  queryPermission?(opts?: PermissionArgs): Promise<PermissionState>;
  requestPermission?(opts?: PermissionArgs): Promise<PermissionState>;
}

export function isFolderSupported(): boolean {
  return typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker === 'function';
}

/**
 * 쓰기 권한을 받아 둔다.
 *
 * 폴더를 고른 것과 거기에 쓸 수 있는 것은 다르다. 고르기만 하면 권한이 "물어봄" 상태로 남고,
 * 실제로 쓸 때 브라우저가 사용자에게 물으려 한다. 그런데 그때는 클릭한 지 한참 지나
 * 사용자 조작 맥락이 끝나 있어 물어보지도 못하고 거절된다.
 * 그래서 고른 직후, 아직 클릭의 힘이 남아 있을 때 받아 둔다.
 */
async function ensureWritable(handle: FileSystemDirectoryHandle): Promise<void> {
  const h = handle as unknown as PermissionedHandle;
  if (!h.queryPermission || !h.requestPermission) return;
  if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') return;
  if (await h.requestPermission({ mode: 'readwrite' }) === 'granted') return;
  throw new Error('폴더에 쓸 권한을 받지 못했습니다. 다시 고르고 "편집 허용"을 눌러 주세요.');
}

/** 사용자가 폴더를 고르게 한다. 취소하면 null. */
export async function pickProjectFolder(): Promise<ProjectAdapter | null> {
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('이 브라우저는 폴더 열기를 지원하지 않습니다. Chrome 또는 Edge 를 쓰세요.');
  try {
    const root = await picker({ mode: 'readwrite' });
    await ensureWritable(root);
    return folderProject(root);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    // 브라우저가 막는 자리가 따로 있다. 원문만 보여 주면 무엇을 해야 할지 알 수 없다.
    if (e instanceof DOMException && e.name === 'NotAllowedError') {
      throw new Error(
        '이 폴더에는 쓸 수 없습니다. 브라우저가 막는 위치(바탕화면·다운로드 상위, 시스템 폴더)이거나 '
        + '편집 허용을 받지 못한 경우입니다. 문서 폴더 아래에 만든 폴더를 고르고 "편집 허용"을 눌러 주세요.',
      );
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ *
 * 폴더 쓰기 진단
 *
 * "not allowed by the user agent or the platform" 은 원인을 여러 개 뭉뚱그린 예외다.
 * 브라우저가 막는 위치인지, 권한을 못 받은 것인지, 조작 맥락이 끝난 것인지 구분되지 않는다.
 * 그래서 실제 저장이 하는 일을 같은 순서로 하나씩 밟아 보고, 어디서 멈추는지 남긴다.
 * 마지막에 만든 것은 지운다 — 진단이 흔적을 남기면 안 된다.
 * ------------------------------------------------------------------ */

export interface ProbeStep { step: string; ok: boolean; detail: string }

const PROBE_DIR = '.kg-probe';

const why = (e: unknown): string =>
  e instanceof DOMException ? `${e.name} — ${e.message}` : String((e as Error)?.message ?? e);

export async function probeFolderAccess(): Promise<ProbeStep[]> {
  const out: ProbeStep[] = [];
  const add = (step: string, ok: boolean, detail = '') => { out.push({ step, ok, detail }); return ok; };

  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
  if (!add('브라우저 지원', typeof picker === 'function', typeof picker)) return out;
  if (!add('보안 맥락', window.isSecureContext, location.origin)) return out;

  let root: FileSystemDirectoryHandle;
  try {
    root = await picker!({ mode: 'readwrite' });
    add('폴더 고르기', true, root.name);
  } catch (e) {
    add('폴더 고르기', false, why(e));
    return out;
  }

  const h = root as unknown as PermissionedHandle;
  try {
    const state = await h.queryPermission?.({ mode: 'readwrite' });
    add('권한 조회', state === 'granted', String(state ?? '메서드 없음'));
    if (state !== 'granted') {
      const asked = await h.requestPermission?.({ mode: 'readwrite' });
      add('권한 요청', asked === 'granted', String(asked ?? '메서드 없음'));
    }
  } catch (e) { add('권한 조회', false, why(e)); }

  // 실제 저장이 밟는 순서 그대로. 하나라도 막히면 거기가 원인이다.
  let probe: FileSystemDirectoryHandle;
  try {
    probe = await root.getDirectoryHandle(PROBE_DIR, { create: true });
    add('하위 폴더 만들기', true, PROBE_DIR);
  } catch (e) {
    add('하위 폴더 만들기', false, why(e));
    return out;
  }

  try {
    const file = await probe.getFileHandle('probe.txt', { create: true });
    add('파일 만들기', true, 'probe.txt');
    const stream = await file.createWritable();
    await stream.write('진단');
    await stream.close();
    add('쓰기', true, '6바이트');
  } catch (e) { add('쓰기', false, why(e)); }

  try {
    await root.removeEntry(PROBE_DIR, { recursive: true });
    add('치우기', true, PROBE_DIR);
  } catch (e) { add('치우기', false, why(e)); }

  return out;
}

/** 진단 결과를 사람이 읽고 그대로 붙여 넣을 수 있는 글로 만든다. */
export function formatProbe(steps: ProbeStep[]): string {
  const lines = steps.map((s) => `${s.ok ? '○' : '✕'} ${s.step}${s.detail ? ` — ${s.detail}` : ''}`);
  const bad = steps.find((s) => !s.ok);
  return [
    '폴더 쓰기 진단',
    ...lines,
    '',
    bad ? `막힌 자리: ${bad.step}` : '모든 단계 통과 — 이 폴더에는 쓸 수 있습니다',
  ].join('\n');
}

export function folderProject(root: FileSystemDirectoryHandle): ProjectAdapter {
  const previewUrls = new Map<string, string>();

  /**
   * 쓰기 직전에 권한을 확인한다.
   *
   * 폴더를 고를 때 받은 권한은 계속 남아 있지 않는다. 브라우저가 되돌리면 그 뒤의 쓰기가
   * 전부 NotAllowedError 로 떨어지는데, 예외 문구만으로는 권한 문제인 줄 알 수 없다.
   * 여기서 먼저 확인하고, 아직 사용자가 누른 힘이 남아 있으면 다시 받아 낸다.
   */
  async function writable(): Promise<void> {
    const h = root as unknown as PermissionedHandle;
    if (!h.queryPermission) return;
    if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') return;
    if (await h.requestPermission?.({ mode: 'readwrite' }) === 'granted') return;
    throw new Error(
      `"${root.name}" 폴더에 쓸 권한이 풀렸습니다. `
      + '슬라이드 탭에서 "프로젝트 폴더 열기"로 같은 폴더를 다시 고르고 "편집 허용"을 눌러 주세요.',
    );
  }

  const dir = async (name: string) => {
    await writable();
    try {
      return await root.getDirectoryHandle(name, { create: true });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        throw new Error(
          `"${root.name}" 폴더의 ${name} 폴더를 만들 수 없습니다. `
          + '브라우저가 쓰기를 막는 위치이거나 편집 허용이 풀린 경우입니다. '
          + '"폴더 쓰기 진단"(검사 탭)을 돌리면 어디서 막혔는지 알 수 있습니다.',
        );
      }
      throw e;
    }
  };

  async function readText(handle: FileSystemDirectoryHandle, name: string): Promise<string | null> {
    try {
      const file = await handle.getFileHandle(name);
      return await (await file.getFile()).text();
    } catch {
      return null;
    }
  }

  async function writeFile(handle: FileSystemDirectoryHandle, name: string, data: string | Blob): Promise<void> {
    await writable();
    try {
      const file = await handle.getFileHandle(name, { create: true });
      const stream = await file.createWritable();
      await stream.write(data);
      await stream.close();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        throw new Error(
          `${name} 을(를) 쓸 수 없습니다. 편집 허용이 풀렸거나 브라우저가 막는 위치입니다. `
          + '"폴더 쓰기 진단"(검사 탭)을 돌리면 어디서 막혔는지 알 수 있습니다.',
        );
      }
      throw e;
    }
  }

  return {
    name: 'folder',
    isFolder: true,
    location: projectNameFrom(root.name),

    async loadDeck() {
      const raw = await readText(root, DECK_FILE);
      if (!raw) {
        // 빈 폴더를 열면 새 프로젝트로 시작한다. 파일은 첫 저장 때 만들어진다.
        return createDeck({ id: crypto.randomUUID(), name: projectNameFrom(root.name), now: new Date().toISOString() });
      }
      return parseDeck(JSON.parse(raw));
    },

    async saveDeck(deck) {
      await writeFile(root, DECK_FILE, JSON.stringify(deck, null, 2));
    },

    async loadSlide(id) {
      const slides = await dir(SLIDES_DIR);
      const raw = await readText(slides, slideFileName(id));
      if (!raw) throw new Error(`장표 파일이 없음: ${SLIDES_DIR}/${slideFileName(id)}`);
      return parseSlideDoc(JSON.parse(raw));
    },

    async saveSlide(doc) {
      const slides = await dir(SLIDES_DIR);
      await writeFile(slides, slideFileName(doc.id), JSON.stringify(assertSlideDoc(doc), null, 2));
    },

    async deleteSlide(id) {
      const slides = await dir(SLIDES_DIR);
      await slides.removeEntry(slideFileName(id)).catch(() => undefined);
      const previews = await dir(PREVIEW_DIR);
      await previews.removeEntry(previewFileName(id)).catch(() => undefined);
      revoke(id);
    },

    async savePreview(id, png) {
      const previews = await dir(PREVIEW_DIR);
      await writeFile(previews, previewFileName(id), png);
      revoke(id);
      return `${PREVIEW_DIR}/${previewFileName(id)}`;
    },

    async loadSettings() {
      const raw = await readText(root, SETTINGS_FILE);
      if (!raw) return DEFAULT_SETTINGS;
      const { settings, issues } = parseSettings(JSON.parse(raw));
      if (issues.length) console.warn(`${SETTINGS_FILE} 일부를 읽지 못해 기본값을 씁니다:`, issues);
      return settings;
    },

    async saveSettings(settings) {
      await writeFile(root, SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
    },

    async previewUrl(id) {
      const cached = previewUrls.get(id);
      if (cached) return cached;
      try {
        const previews = await dir(PREVIEW_DIR);
        const handle = await previews.getFileHandle(previewFileName(id));
        const url = URL.createObjectURL(await handle.getFile());
        previewUrls.set(id, url);
        return url;
      } catch {
        return null;
      }
    },
  };

  function revoke(id: string) {
    const url = previewUrls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrls.delete(id);
    }
  }
}
