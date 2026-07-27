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

export function folderProject(root: FileSystemDirectoryHandle): ProjectAdapter {
  const previewUrls = new Map<string, string>();

  const dir = (name: string) => root.getDirectoryHandle(name, { create: true });

  async function readText(handle: FileSystemDirectoryHandle, name: string): Promise<string | null> {
    try {
      const file = await handle.getFileHandle(name);
      return await (await file.getFile()).text();
    } catch {
      return null;
    }
  }

  async function writeFile(handle: FileSystemDirectoryHandle, name: string, data: string | Blob): Promise<void> {
    const file = await handle.getFileHandle(name, { create: true });
    const stream = await file.createWritable();
    await stream.write(data);
    await stream.close();
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
