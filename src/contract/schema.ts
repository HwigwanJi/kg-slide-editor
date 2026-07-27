/**
 * 저장계약 (Save Contract) — 문서 전체의 합성 지점.
 *
 * 개념별 정의는 각 모듈이 소유한다. 여기서는 조립만 한다.
 *   identity.ts    식별자 규칙
 *   style.ts       모양 오버레이 (patches)
 *   tree.ts        존재·구조 오버레이 (삭제·추가·그룹·잠금)
 *   typography.ts  위계와 문서 전역 테마
 *
 * 규칙
 *  - 타입은 zod 스키마에서 z.infer 로 파생한다. 손으로 또 선언하지 않는다.
 *  - 형식을 바꾸면 CONTRACT_VERSION 을 올리고 migrate.ts 에 이관 규칙을 넣는다.
 *  - 문서는 네 개의 진실만 담는다: 원본 · 모양 · 구조 · 순서.
 */
import { z } from 'zod';
import { zNodeId } from './identity';
import { zNodePatch } from './style';
import { EMPTY_TREE, zTreeOverlay } from './tree';
import { DEFAULT_THEME, zTheme } from './typography';

/**
 * 계약 버전.
 *  v2 — tree(구조 오버레이)와 theme(위계 전역값) 도입
 *  v3 — 본문 위계를 body1~body4 로 분할, 말머리표와 노드별 위계 지정 도입
 *  v4 — 태그 위계를 label / label2 / num 으로 분할
 *  v5 — 도형(SVG) 지원: 슬롯 노드와 CSS 변수 재지정
 */
export const CONTRACT_VERSION = 6;

/** KG 장표 캔버스 규격 (A4 가로). kg-slide.css 의 .kg-slide 와 일치해야 한다. */
export const KG_CANVAS = { w: 1280, h: 905 } as const;

/** 원본 장표 소스. 불변. */
export const zSlideSource = z.object({
  kind: z.literal('kg-html'),
  /** <section class="kg-slide">…</section> 원본 그대로 */
  html: z.string(),
  /** 장표 전용 <style> 본문. KG 공통 CSS는 포함하지 않는다. */
  css: z.string().default(''),
  origin: z.string().optional(),
}).strict();
export type SlideSource = z.infer<typeof zSlideSource>;

export const zSlideDoc = z.object({
  v: z.number().int().positive(),
  id: z.string().min(1),
  title: z.string().default(''),
  canvas: z.object({ w: z.number().positive(), h: z.number().positive() }),

  /** 원본 — 불변 */
  source: zSlideSource,
  /** 모양 — NodeId 별 덧씌움 */
  patches: z.record(zNodeId, zNodePatch).default({}),
  /** 존재·구조 — 삭제 묘비, 추가 노드, 그룹, 잠금 */
  tree: zTreeOverlay.default(EMPTY_TREE),
  /** 위계 전역값. 노드 개별 오버라이드(patches.style)가 항상 이긴다. */
  theme: zTheme.default(DEFAULT_THEME),
  /** 쌓임 순서. 떼어낸 노드와 추가 노드가 들어간다. 뒤로 갈수록 위. */
  stack: z.array(zNodeId).default([]),

  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();
export type SlideDoc = z.infer<typeof zSlideDoc>;

/** 목록 화면용 요약. 문서 전체를 읽지 않고 나열할 때 쓴다. */
export const zSlideMeta = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
}).strict();
export type SlideMeta = z.infer<typeof zSlideMeta>;

export function metaOf(doc: SlideDoc): SlideMeta {
  return { id: doc.id, title: doc.title, updatedAt: doc.updatedAt };
}

/** 빈 문서 생성. 임포트 어댑터가 source 를 채워 넣는다. */
export function createSlideDoc(init: {
  id: string;
  title?: string;
  source: SlideSource;
  now: string;
  locked?: string[];
}): SlideDoc {
  return {
    v: CONTRACT_VERSION,
    id: init.id,
    title: init.title ?? '',
    canvas: { ...KG_CANVAS },
    source: init.source,
    patches: {},
    tree: { ...EMPTY_TREE, locked: init.locked ?? [] },
    theme: { ...DEFAULT_THEME, roles: {} },
    stack: [],
    createdAt: init.now,
    updatedAt: init.now,
  };
}
