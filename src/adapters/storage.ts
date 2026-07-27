/**
 * 저장소 어댑터.
 *
 * 저장계약(SlideDoc)과 저장 위치는 분리한다. 지금은 localStorage 하나뿐이지만,
 * 나중에 Supabase·파일서버로 바뀌어도 이 인터페이스만 다시 구현하면 되고
 * 코어·UI는 건드리지 않는다.
 */
import { assertSlideDoc, metaOf, parseSlideDoc, type SlideDoc, type SlideMeta } from '@contract/index';

export interface StorageAdapter {
  readonly name: string;
  list(): Promise<SlideMeta[]>;
  load(id: string): Promise<SlideDoc>;
  save(doc: SlideDoc): Promise<void>;
  remove(id: string): Promise<void>;
}

const PREFIX = 'kg-slide-editor/doc/';

export const localAdapter: StorageAdapter = {
  name: 'local',

  async list() {
    const out: SlideMeta[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        out.push(metaOf(parseSlideDoc(JSON.parse(localStorage.getItem(key)!))));
      } catch {
        // 깨진 항목은 목록에서 건너뛴다. 지우지는 않는다(복구 가능성).
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async load(id) {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) throw new Error(`문서를 찾을 수 없음: ${id}`);
    return parseSlideDoc(JSON.parse(raw));
  },

  async save(doc) {
    localStorage.setItem(PREFIX + doc.id, JSON.stringify(assertSlideDoc(doc)));
  },

  async remove(id) {
    localStorage.removeItem(PREFIX + id);
  },
};

/* ---------- 파일 왕복 (백업·이관) ---------- */

export function downloadDoc(doc: SlideDoc): void {
  download(`${slugify(doc.title || doc.id)}.kgslide.json`, JSON.stringify(assertSlideDoc(doc), null, 2), 'application/json');
}

export function downloadText(filename: string, text: string, mime = 'text/html'): void {
  download(filename, text, mime);
}

export async function readDocFile(file: File): Promise<SlideDoc> {
  return parseSlideDoc(JSON.parse(await file.text()));
}

function download(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'slide';
}
