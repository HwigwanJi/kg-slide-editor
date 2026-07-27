/**
 * 프로젝트 저장소 — 덱 하나와 장표 여러 개를 다룬다.
 *
 * 계약(무엇을 저장하는가)과 위치(어디에 저장하는가)를 분리한다.
 * 구현은 둘이다.
 *   localProject   브라우저 안. 준비 없이 바로 쓴다.
 *   folderProject  실제 폴더(project.folder.ts). Claude Code 가 만든 파일을 그대로 연다.
 *
 * 폴더 구조는 계약이 정한다(contract/deck.ts).
 *   deck.json / slides/*.kgslide / preview/*.png / library/*.svg
 */
import {
  DECK_FILE, assertSlideDoc, createDeck, parseDeck, parseSlideDoc,
  type DeckDoc, type SlideDoc,
} from '@contract/index';

export interface ProjectAdapter {
  readonly name: string;
  /** 사람이 파일탐색기에서 볼 수 있는 실제 폴더인가 */
  readonly isFolder: boolean;
  /** 표시용 위치 이름 */
  readonly location: string;

  loadDeck(): Promise<DeckDoc>;
  saveDeck(deck: DeckDoc): Promise<void>;
  loadSlide(id: string): Promise<SlideDoc>;
  saveSlide(doc: SlideDoc): Promise<void>;
  deleteSlide(id: string): Promise<void>;

  /** 미리보기 PNG. 지원하지 않는 저장소는 생략한다. */
  savePreview?(id: string, png: Blob): Promise<string>;
  previewUrl?(id: string): Promise<string | null>;
}

/* ------------------------------------------------------------------ */
/* 브라우저 저장소                                                      */
/* ------------------------------------------------------------------ */

const DECK_KEY = 'kg-slide-editor/deck';
const SLIDE_PREFIX = 'kg-slide-editor/doc/';

export const localProject: ProjectAdapter = {
  name: 'local',
  isFolder: false,
  location: '브라우저 저장소',

  async loadDeck() {
    const raw = localStorage.getItem(DECK_KEY);
    if (!raw) return createDeck({ id: crypto.randomUUID(), name: '기본 프로젝트', now: new Date().toISOString() });
    return parseDeck(JSON.parse(raw));
  },

  async saveDeck(deck) {
    localStorage.setItem(DECK_KEY, JSON.stringify(deck));
  },

  async loadSlide(id) {
    const raw = localStorage.getItem(SLIDE_PREFIX + id);
    if (!raw) throw new Error(`장표를 찾을 수 없음: ${id}`);
    return parseSlideDoc(JSON.parse(raw));
  },

  async saveSlide(doc) {
    localStorage.setItem(SLIDE_PREFIX + doc.id, JSON.stringify(assertSlideDoc(doc)));
  },

  async deleteSlide(id) {
    localStorage.removeItem(SLIDE_PREFIX + id);
  },
};

/* ------------------------------------------------------------------ */

/** 목차와 실제 저장분이 어긋났을 때 사람이 볼 설명. */
export function describeMismatch(missing: string[]): string {
  if (missing.length === 0) return '';
  return `목차에 있으나 파일이 없는 장표 ${missing.length}건 — ${DECK_FILE} 를 정리해야 합니다.`;
}

/** 폴더 이름에서 프로젝트 이름을 만든다. */
export function projectNameFrom(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? '프로젝트';
}
