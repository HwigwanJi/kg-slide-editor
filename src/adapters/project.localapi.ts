/**
 * 로컬 파일 다리 저장소 — dev 서버가 node 로 폴더를 만진다.
 *
 * project.folder.ts 와 같은 일을 하되 권한이 없다. File System Access API 는 브라우저가
 * 주인이라 넷을 못 넘는다: Chromium 전용 · 막히는 위치가 따로 있음 · 새로고침하면 권한이 풀림 ·
 * 요청이 클릭 직후에만 통함. 그래서 저쪽은 절반이 권한과 싸우는 코드다.
 *
 * 여기서는 그 넷이 성립하지 않으므로 ensureWritable · writable · probeFolderAccess 가 통째로 없다.
 * 폴더 위치는 경로 문자열 하나다. 핸들이 아니므로 IndexedDB 에 담아 둘 일도 없다.
 *
 * 바깥 세계와 붙는 지점은 fs() 하나다. Electron 으로 옮길 때 그것만 IPC 로 바꾼다.
 */
import {
  ASSETS_DIR, DECK_FILE, DECK_FILE_LEGACY, DEFAULT_SETTINGS, PREVIEW_DIR, SETTINGS_FILE, SLIDES_DIR, SLIDE_EXT,
  assertSlideDoc, createDeck, parseDeck, parseSettings, parseSlideDoc, previewFileName, slideFileName,
  type DeckEntry, type SlideDoc,
} from '@contract/index';
import { reconcileSlides } from '@core/deck';
import { mergeForSave } from '@core/merge';
import { projectNameFrom, type ProjectAdapter } from './project';

const PREFIX = '/__kgfs/';
/** 표준 헤더가 아닌 것을 하나 붙인다. 남의 페이지에서는 이 요청이 브라우저에 막힌다. */
const MARK = { 'x-kg-fs': '1' };

export interface DirEntry { name: string; kind: 'dir' | 'file' }
export interface DirListing { path: string; parent: string | null; items: DirEntry[] }

/** 다리가 붙어 있는가. dev 서버로 띄웠을 때만 참이다. */
export async function isBridgeUp(): Promise<boolean> {
  try {
    const res = await fetch(`${PREFIX}roots`, { headers: MARK });
    return res.ok;
  } catch {
    return false;
  }
}

/** 서버가 준 까닭을 그대로 사람에게 올린다. 삼키면 무엇이 막혔는지 알 수 없다. */
async function blowUp(res: Response): Promise<never> {
  let why = `${res.status}`;
  try { why = ((await res.json()) as { error?: string }).error ?? why; } catch { /* 본문이 없을 수 있다 */ }
  throw new Error(why);
}

async function get(op: string, path: string): Promise<Response> {
  const res = await fetch(`${PREFIX}${op}?path=${encodeURIComponent(path)}`, { headers: MARK });
  if (!res.ok) await blowUp(res);
  return res;
}

async function post(op: string, body: unknown): Promise<void> {
  const res = await fetch(`${PREFIX}${op}`, {
    method: 'POST',
    headers: { ...MARK, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await blowUp(res);
}

export const listDir = (path: string): Promise<DirListing> =>
  get('list', path).then((r) => r.json() as Promise<DirListing>);

export const listRoots = async (): Promise<string[]> => {
  const res = await fetch(`${PREFIX}roots`, { headers: MARK });
  if (!res.ok) await blowUp(res);
  return ((await res.json()) as { roots: string[] }).roots;
};

export interface ExportResult { out: string; made: string[]; count: number; missing: string[] }

/**
 * 덱을 PNG·PDF 로 내보낸다. 실제로 찍는 일은 dev 서버가 한다.
 *
 * 브라우저 안에서는 KG 의 그라데이션·clip-path·웹폰트를 그대로 찍을 방법이 없다.
 * 명령줄 도구와 같은 것을 부르므로 화면에서 내보낸 것과 명령줄에서 내보낸 것이 같다.
 */
export async function exportDeck(root: string, what: { png?: boolean; pdf?: boolean; pptx?: boolean }): Promise<ExportResult> {
  const res = await fetch(`${PREFIX}export`, {
    method: 'POST',
    headers: { ...MARK, 'content-type': 'application/json' },
    body: JSON.stringify({ root, ...what }),
  });
  if (!res.ok) await blowUp(res);
  return (await res.json()) as ExportResult;
}

/** 설치가 깔아 둔 시작 프로젝트. 열 것이 없을 때 이것을 연다. */
export const listStarters = async (): Promise<string[]> => {
  try {
    const res = await fetch(`${PREFIX}starters`, { headers: MARK });
    if (!res.ok) return [];
    return ((await res.json()) as { starters: string[] }).starters;
  } catch {
    return [];
  }
};

/* ------------------------------------------------------------------ */

/** 없으면 null. 부르는 쪽이 "파일 없음" 으로 다룬다 — 폴더 저장소와 같은 규칙이다. */
async function readText(path: string): Promise<string | null> {
  try {
    return await (await get('read', path)).text();
  } catch {
    return null;
  }
}

const writeText = (path: string, text: string) => post('write', { path, text });

async function writeBlob(path: string, blob: Blob): Promise<void> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  // 한 번에 넘기면 인자 수 제한에 걸린다. 큰 미리보기 PNG 가 실제로 걸린다.
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  await post('write', { path, base64: btoa(bin) });
}

async function mtime(path: string): Promise<number> {
  try {
    const s = (await (await get('stat', path)).json()) as { exists: boolean; mtime: number };
    return s.exists ? s.mtime : 0;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ */

export function localApiProject(root: string): ProjectAdapter {
  const previewUrls = new Map<string, string>();
  const assetUrls = new Map<string, string>();
  const at = (...parts: string[]) => [root, ...parts].join('/');

  function revoke(id: string) {
    const url = previewUrls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrls.delete(id);
    }
  }

  return {
    name: 'localapi',
    isFolder: true,
    location: projectNameFrom(root),
    root,

    /**
     * 무엇이 있는가는 slides/ 안의 파일이 정하고, 어떤 순서인가는 목차가 정한다.
     * 목차가 존재까지 정하면 폴더에 파일을 넣어도 화면에 뜨지 않는다 — 여러 대에서 그려 모으는
     * 방식과 정면으로 어긋난다. 폴더 저장소와 같은 규칙이어야 어느 쪽으로 열든 같게 보인다.
     */
    async loadDeck() {
      const raw = await readText(at(DECK_FILE)) ?? await readText(at(DECK_FILE_LEGACY));
      const base = raw
        ? parseDeck(JSON.parse(raw))
        : createDeck({ id: crypto.randomUUID(), name: projectNameFrom(root), now: new Date().toISOString() });

      let listing: DirListing;
      try {
        listing = await listDir(at(SLIDES_DIR));
      } catch {
        return { ...base, slides: [] };
      }

      const onDisk: DeckEntry[] = [];
      for (const entry of listing.items) {
        if (entry.kind !== 'file' || !entry.name.endsWith(SLIDE_EXT)) continue;
        const text = await readText(at(SLIDES_DIR, entry.name));
        if (!text) continue;
        try {
          const doc = parseSlideDoc(JSON.parse(text));
          onDisk.push({
            id: doc.id,
            title: doc.title,
            updatedAt: doc.updatedAt,
            ...(doc.source.origin ? { origin: doc.source.origin } : {}),
          });
        } catch {
          // 읽을 수 없는 파일은 없는 것으로 둔다. 목록이 통째로 죽는 편이 더 나쁘다.
        }
      }

      return { ...base, slides: reconcileSlides(base.slides, onDisk) };
    },

    async saveDeck(deck) {
      await writeText(at(DECK_FILE), JSON.stringify(deck, null, 2));
    },

    async loadSlide(id) {
      const raw = await readText(at(SLIDES_DIR, slideFileName(id)));
      if (!raw) throw new Error(`장표 파일이 없음: ${SLIDES_DIR}/${slideFileName(id)}`);
      return parseSlideDoc(JSON.parse(raw));
    },

    /**
     * 오버레이만 우리 것으로 쓴다.
     *
     * 메모리의 원본은 폴더를 연 시점의 것이라, 그 사이 명령줄이 새로 그렸다면 그것을 덮어 버린다.
     * 그래서 디스크에서 다시 읽어 붙인다(docs/CONCURRENCY.md — 필드마다 주인이 하나여야 한다).
     */
    async saveSlide(doc) {
      const raw = await readText(at(SLIDES_DIR, slideFileName(doc.id)));
      let disk: SlideDoc | null = null;
      try { disk = raw ? parseSlideDoc(JSON.parse(raw)) : null; } catch { disk = null; }
      const { doc: merged } = mergeForSave(doc, disk);
      await writeText(at(SLIDES_DIR, slideFileName(doc.id)), JSON.stringify(assertSlideDoc(merged), null, 2));
    },

    async deleteSlide(id) {
      await post('remove', { path: at(SLIDES_DIR, slideFileName(id)) });
      await post('remove', { path: at(PREVIEW_DIR, previewFileName(id)) }).catch(() => undefined);
      revoke(id);
    },

    async savePreview(id, png) {
      await writeBlob(at(PREVIEW_DIR, previewFileName(id)), png);
      revoke(id);
      return `${PREVIEW_DIR}/${previewFileName(id)}`;
    },

    async loadSettings() {
      const raw = await readText(at(SETTINGS_FILE));
      if (!raw) return DEFAULT_SETTINGS;
      const { settings, issues } = parseSettings(JSON.parse(raw));
      if (issues.length) console.warn(`${SETTINGS_FILE} 일부를 읽지 못해 기본값을 씁니다:`, issues);
      return settings;
    },

    async saveSettings(settings) {
      await writeText(at(SETTINGS_FILE), `${JSON.stringify(settings, null, 2)}\n`);
    },

    async stamps(slideId) {
      return {
        deck: Math.max(await mtime(at(DECK_FILE)), await mtime(at(DECK_FILE_LEGACY))),
        slide: await mtime(at(SLIDES_DIR, slideFileName(slideId))),
      };
    },

    /**
     * 프로젝트 그림. 미리보기와 같은 방식이되 이름으로 찾는다.
     *
     * 경로 탈출은 막는다. 장표의 그림 경로는 작도가 만든 것이고 사람이 손댈 수도 있어,
     * `assets/../../…` 같은 것이 흘러들면 프로젝트 밖을 읽게 된다.
     */
    async assetUrl(name) {
      if (name.includes('..')) return null;
      const cached = assetUrls.get(name);
      if (cached) return cached;
      try {
        const res = await get('read', at(ASSETS_DIR, name));
        const url = URL.createObjectURL(await res.blob());
        assetUrls.set(name, url);
        return url;
      } catch {
        return null;
      }
    },

    /**
     * <img src> 로는 표준 밖 헤더를 붙일 수 없다. 그래서 받아서 blob URL 로 만든다.
     * 폴더 저장소가 파일 핸들로 하는 것과 같다.
     */
    async previewUrl(id) {
      const cached = previewUrls.get(id);
      if (cached) return cached;
      try {
        const res = await get('read', at(PREVIEW_DIR, previewFileName(id)));
        const url = URL.createObjectURL(await res.blob());
        previewUrls.set(id, url);
        return url;
      } catch {
        return null;
      }
    },
  };
}
