/**
 * 저장계약 (Save Contract) — SSOT
 * ---------------------------------------------------------------------------
 * 이 파일이 문서 형식의 유일한 진실이다.
 *  - 타입은 zod 스키마에서 파생(z.infer)한다. 타입을 손으로 따로 선언하지 않는다.
 *  - 문서(docs/SAVE_CONTRACT.md)는 이 파일을 설명만 하고 재정의하지 않는다.
 *  - 필드를 추가/변경하면 CONTRACT_VERSION 을 올리고 migrate.ts 에 이관 규칙을 넣는다.
 *
 * 문서 모델의 핵심 원칙
 *  1. source(KG가 그린 원본 HTML)는 불변이다. 편집 결과를 원본에 되쓰지 않는다.
 *  2. 모든 편집분은 patches 한 곳에만 존재한다. 렌더·내보내기·저장이 같은 곳을 읽는다.
 *  3. 색상은 KG 토큰 참조(token:navy-800)를 우선한다. hex는 예외 경로다.
 *  4. z-order의 진실은 stack 배열 하나다. 노드에 z 값을 따로 두지 않는다.
 */
import { z } from 'zod';

/** 계약 버전. 형식이 바뀌면 반드시 올린다. */
export const CONTRACT_VERSION = 1;

/** KG 장표 캔버스 규격 (A4 가로). kg-slide.css 의 .kg-slide 와 일치해야 한다. */
export const KG_CANVAS = { w: 1280, h: 905 } as const;

/** 편집 대상 요소를 가리키는 안정 식별자. 임포트 시 구조 경로로 확정한다. (예: "n.2.0.1") */
export const zNodeId = z.string().regex(/^n(\.\d+)*$/, 'NodeId 형식은 n[.index]* 이다');

/**
 * 색상 참조.
 * - `token:navy-800`  → var(--navy-800) 으로 렌더 (권장)
 * - `#1F497D`         → 하드코딩. 브랜드 이탈이므로 UI에서 경고 대상.
 */
export const zColorRef = z.union([
  z.string().regex(/^token:[a-z0-9-]+$/, 'token:<KG 토큰명> 형식'),
  z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  z.literal('transparent'),
  z.literal('inherit'),
]);

/** 텍스트 정렬 (문단 정렬). 개체 정렬과 구분한다. */
export const zTextAlign = z.enum(['left', 'center', 'right', 'justify']);

/** 개체 정렬 기준 (detached 요소에만 적용). */
export const zObjectAlign = z.enum(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']);

/** KG 폰트 굵기 스케일 (colors_and_type.css --fw-* 와 동일 범위). */
export const zFontWeight = z.union([
  z.literal(300), z.literal(400), z.literal(500), z.literal(600),
  z.literal(700), z.literal(800), z.literal(900),
]);

/** 사각 여백 [상, 우, 하, 좌] — px */
export const zBox4 = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** 서식 패치 — 색상·타이포·테두리·여백. 지정한 항목만 원본 위에 덮인다. */
export const zStylePatch = z.object({
  color: zColorRef.optional(),
  background: zColorRef.optional(),
  borderColor: zColorRef.optional(),
  borderWidth: z.number().min(0).max(12).optional(),
  radius: z.number().min(0).max(999).optional(),
  fontSize: z.number().min(8).max(96).optional(),
  fontWeight: zFontWeight.optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  letterSpacing: z.number().min(-0.1).max(0.5).optional(),
  textAlign: zTextAlign.optional(),
  padding: zBox4.optional(),
  opacity: z.number().min(0).max(1).optional(),
}).strict();

/**
 * 배치 모드.
 * - flow     : KG 흐름 레이아웃 유지. dx/dy 로 미세 이동만 한다(주변 재배치 없음).
 * - detached : 흐름에서 떼어내 캔버스 절대좌표로 고정. 자유 이동·리사이즈 가능.
 */
export const zLayoutMode = z.enum(['flow', 'detached']);

export const zLayoutPatch = z.object({
  mode: zLayoutMode,
  /** detached 전용 — 캔버스(1280×905) 좌표계 px */
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().min(4).optional(),
  h: z.number().min(4).optional(),
  /** flow 전용 — 시각적 미세 오프셋 px */
  dx: z.number().optional(),
  dy: z.number().optional(),
}).strict();

/** 인라인 텍스트 패치. 허용 마크업은 b/strong/i/em/u/s/br 로 제한한다. */
export const zTextPatch = z.object({
  html: z.string(),
}).strict();

/** 한 노드에 대한 편집분 전체. */
export const zNodePatch = z.object({
  text: zTextPatch.optional(),
  style: zStylePatch.optional(),
  layout: zLayoutPatch.optional(),
  hidden: z.boolean().optional(),
}).strict();

/** 원본 장표 소스. 불변. */
export const zSlideSource = z.object({
  kind: z.literal('kg-html'),
  /** <section class="kg-slide">…</section> 원본 그대로 */
  html: z.string(),
  /** 장표 전용 <style> 본문. KG 공통 CSS(colors_and_type/kg-slide)는 포함하지 않는다. */
  css: z.string().default(''),
  /** 원본 파일명·경로 (추적용) */
  origin: z.string().optional(),
}).strict();

/** 저장 문서. 이 객체 하나가 장표 한 장의 전부다. */
export const zSlideDoc = z.object({
  v: z.number().int().positive(),
  id: z.string().min(1),
  title: z.string().default(''),
  canvas: z.object({ w: z.number().positive(), h: z.number().positive() }),
  source: zSlideSource,
  /** NodeId → 편집분. 편집 결과는 오직 여기에만 쌓인다. */
  patches: z.record(zNodeId, zNodePatch).default({}),
  /** detached 요소의 쌓임 순서. 뒤로 갈수록 위에 온다. z-index는 여기서 파생한다. */
  stack: z.array(zNodeId).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

export type NodeId = z.infer<typeof zNodeId>;
export type ColorRef = z.infer<typeof zColorRef>;
export type TextAlign = z.infer<typeof zTextAlign>;
export type ObjectAlign = z.infer<typeof zObjectAlign>;
export type FontWeight = z.infer<typeof zFontWeight>;
export type StylePatch = z.infer<typeof zStylePatch>;
export type LayoutMode = z.infer<typeof zLayoutMode>;
export type LayoutPatch = z.infer<typeof zLayoutPatch>;
export type TextPatch = z.infer<typeof zTextPatch>;
export type NodePatch = z.infer<typeof zNodePatch>;
export type SlideSource = z.infer<typeof zSlideSource>;
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
}): SlideDoc {
  return {
    v: CONTRACT_VERSION,
    id: init.id,
    title: init.title ?? '',
    canvas: { ...KG_CANVAS },
    source: init.source,
    patches: {},
    stack: [],
    createdAt: init.now,
    updatedAt: init.now,
  };
}
