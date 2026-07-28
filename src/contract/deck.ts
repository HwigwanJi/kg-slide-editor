/**
 * 덱(프로젝트) 계약 — 순서와 목차만 소유한다. SSOT.
 *
 * 장표 내용은 절대 담지 않는다. 장표 하나가 원본 HTML을 통째로 품고 있어 수백KB이므로,
 * 덱에 내용을 넣으면 20장짜리가 수MB가 되고 한 장을 고칠 때마다 전체를 다시 쓰게 된다.
 * (docs/DECISIONS.md D1)
 *
 * 순서의 진실은 slides 배열 하나다. 장표 파일은 자기가 몇 번째인지 모른다.
 */
import { z } from 'zod';

/** 덱 계약 버전. 장표 계약(CONTRACT_VERSION)과 따로 올린다. */
export const DECK_VERSION = 1;

/** 목차 한 줄. 장표를 열지 않고 목록을 그릴 수 있을 만큼만 담는다. */
export const zDeckEntry = z.object({
  /** 장표 id. 파일 이름의 기준이기도 하다. */
  id: z.string().min(1),
  title: z.string().default(''),
  /** 미리보기 PNG 경로. 아직 찍지 않았으면 없다. */
  preview: z.string().optional(),
  /**
   * 이 장표를 만들어 낸 원본 파일 이름(source/*.html).
   * 같은 원본을 다시 넣을 때 새로 만들지 않고 그 자리를 갱신하기 위한 표식이다.
   */
  origin: z.string().optional(),
  updatedAt: z.string(),
}).strict();
export type DeckEntry = z.infer<typeof zDeckEntry>;

export const zDeckDoc = z.object({
  v: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().default(''),
  /** 순서의 유일한 진실. 앞이 1번 장표다. */
  slides: z.array(zDeckEntry).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();
export type DeckDoc = z.infer<typeof zDeckDoc>;

export function createDeck(init: { id: string; name?: string; now: string }): DeckDoc {
  return {
    v: DECK_VERSION,
    id: init.id,
    name: init.name ?? '새 프로젝트',
    slides: [],
    createdAt: init.now,
    updatedAt: init.now,
  };
}

export class DeckError extends Error {
  constructor(message: string, readonly issues: string[] = []) {
    super(message);
    this.name = 'DeckError';
  }
}

/** 경계 검증. 장표 계약과 같은 원칙 — 읽은 직후, 쓰기 직전에만 한다. */
export function parseDeck(raw: unknown): DeckDoc {
  const result = zDeckDoc.safeParse(raw);
  if (!result.success) {
    throw new DeckError(
      '덱 계약 위반 — 프로젝트를 읽을 수 없음',
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  if (result.data.v > DECK_VERSION) {
    throw new DeckError(`알 수 없는 덱 버전: ${result.data.v} (현재 ${DECK_VERSION})`);
  }
  return result.data;
}

/** 파일 이름 규칙. 어댑터가 폴더에 쓸 때도 이 이름을 쓴다. */
/** 장표 파일 확장자. 폴더를 훑어 장표를 찾을 때도 이 값을 쓴다. */
export const SLIDE_EXT = '.kgslide';

export function slideFileName(id: string): string {
  return `${id}${SLIDE_EXT}`;
}
export function previewFileName(id: string): string {
  return `${id}.png`;
}
/**
 * 프로젝트 파일. 이 파일이 있는 폴더가 곧 프로젝트다.
 * 사람이 파일탐색기에서 보고 "이게 프로젝트구나" 알 수 있도록 확장자를 따로 둔다.
 */
export const DECK_FILE = 'project.kgproj';
/** 예전 이름. 이미 만든 프로젝트를 열려면 이것도 읽어야 한다. */
export const DECK_FILE_LEGACY = 'deck.json';
export const SLIDES_DIR = 'slides';
export const PREVIEW_DIR = 'preview';
/**
 * 도형 라이브러리 폴더.
 *
 * `npm run dead` 가 "아무도 안 부른다" 고 짚는데, 지우지 않는다. 이 상수 묶음은
 * 프로젝트 폴더가 어떻게 생겼는지를 계약이 선언한 것이고, `library/` 는 실제로 있다.
 * 지금 이 이름을 읽는 것이 `tools/lint.mjs` 뿐인데 도구는 .mjs 라 계약을 가져오지 못해
 * 글자로 적어 두고 있을 뿐이다. 여기서 빼면 계약이 폴더 구조를 반만 말하게 된다.
 */
export const LIBRARY_DIR = 'library';
/**
 * 프로젝트가 쓰는 그림. pptx 에서 뽑은 캡처처럼 사람이 가져온 것이 여기 온다.
 *
 * 프로젝트가 자기 것을 갖는 이유는 예전에 실제로 잃었기 때문이다. 그림이 스킬 소유 폴더
 * (public/kg/assets)에 얹혀 있었는데, npm run setup 이 그 폴더를 통째로 갈아 끼우면서
 * 프로젝트 그림이 함께 사라졌다(docs/CONCURRENCY.md, 2026-07-27).
 *
 * 장표는 이 폴더를 `assets/…` 상대경로로 가리킨다. 절대경로나 남의 폴더를 가리키지 않으므로
 * 프로젝트를 통째로 옮기거나 남에게 넘겨도 그림이 따라간다.
 */
export const ASSETS_DIR = 'assets';
/**
 * 내보낸 것 — 사람이 꺼내 쓰는 자리.
 *
 * preview/ 와 헷갈리기 쉬우나 성격이 다르다. preview/ 는 편집기가 좌측 목록 썸네일로 찾는
 * `<id>.png` 이고, 여기는 사람이 제출·공유하려고 꺼내는 `01_제목.png` 과 덱 한 벌짜리 PDF 다.
 * 섞어 두면 편집기가 못 알아보는 파일이 preview/ 에 쌓이고, 다시 찍을 때 낡은 것이 남는다.
 */
export const EXPORT_DIR = 'export';
