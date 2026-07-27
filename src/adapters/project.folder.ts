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

export function isFolderSupported(): boolean {
  return typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker === 'function';
}

/** 사용자가 폴더를 고르게 한다. 취소하면 null. */
export async function pickProjectFolder(): Promise<ProjectAdapter | null> {
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('이 브라우저는 폴더 열기를 지원하지 않습니다. Chrome 또는 Edge 를 쓰세요.');
  try {
    return folderProject(await picker({ mode: 'readwrite' }));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
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
