/**
 * 모양 오버레이 — 한 노드가 어떻게 보이는가. SSOT.
 *
 * tree.ts(존재)와 짝을 이룬다. 여기 있는 값은 전부 "원본 위에 덮는 것"이며,
 * 지정하지 않은 항목은 KG 원본 스타일이 그대로 보인다.
 *
 * 서식 복사/붙여넣기(Ctrl+Shift+C/V)가 그대로 옮기는 단위가 StylePatch 다.
 * 그래서 새 서식 항목을 추가하면 서식 복사에도 자동으로 포함된다 — 따로 목록을 관리하지 않는다.
 */
import { z } from 'zod';

/**
 * 색상 참조.
 * - `token:navy-800` → var(--navy-800) 으로 렌더 (권장)
 * - `#1F497D`        → 하드코딩. 브랜드 이탈이므로 UI에서 경고 대상.
 */
export const zColorRef = z.union([
  z.string().regex(/^token:[a-z0-9-]+$/, 'token:<KG 토큰명> 형식'),
  z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  z.literal('transparent'),
  z.literal('inherit'),
]);
export type ColorRef = z.infer<typeof zColorRef>;

/** 그라데이션. 임의 CSS 문자열을 받지 않고 구조로 받아 브랜드 토큰만 쓰이게 한다. */
export const zGradient = z.object({
  from: zColorRef,
  to: zColorRef,
  angle: z.number().min(0).max(360).default(180),
}).strict();
export type Gradient = z.infer<typeof zGradient>;

export const zTextAlign = z.enum(['left', 'center', 'right', 'justify']);
export type TextAlign = z.infer<typeof zTextAlign>;

/** 개체 정렬 기준 (떼어낸 요소에만 적용). 문단 정렬과 구분한다. */
export const zObjectAlign = z.enum(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']);
export type ObjectAlign = z.infer<typeof zObjectAlign>;

/** 개체 균등 배분 */
export const zDistribute = z.enum(['horizontal', 'vertical']);
export type Distribute = z.infer<typeof zDistribute>;

export const zFontWeight = z.union([
  z.literal(300), z.literal(400), z.literal(500), z.literal(600),
  z.literal(700), z.literal(800), z.literal(900),
]);
export type FontWeight = z.infer<typeof zFontWeight>;

/** [상, 우, 하, 좌] px */
export const zBox4 = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const zStylePatch = z.object({
  color: zColorRef.optional(),
  background: zColorRef.optional(),
  /** 지정하면 background 대신 쓰인다. */
  gradient: zGradient.optional(),
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
  /**
   * 이 요소만의 말머리표. 위계 전역값을 덮는다.
   * 빈 문자열이면 "이 요소는 말머리표 없음"이라는 뜻이며, 전역값이 켜져 있어도 끈다.
   */
  marker: z.string().max(4).optional(),
}).strict();
export type StylePatch = z.infer<typeof zStylePatch>;

/**
 * 배치 모드.
 * - flow     : KG 흐름 레이아웃 유지. dx/dy 로 시각적 미세 이동만 한다(주변 재배치 없음).
 * - detached : 흐름에서 떼어내 캔버스 절대좌표로 고정. 자유 이동·크기 조절.
 *
 * 떼어낼 때 원래 자리에는 같은 크기의 빈 자리를 남긴다(render.ts). 그래야 주변이 밀리지 않는다.
 */
export const zLayoutMode = z.enum(['flow', 'detached']);
export type LayoutMode = z.infer<typeof zLayoutMode>;

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
  /** 떼어낸 뒤 원래 자리를 비워 둘지. 기본 true — 주변 요소가 밀리지 않는다. */
  keepSlot: z.boolean().optional(),
}).strict();
export type LayoutPatch = z.infer<typeof zLayoutPatch>;

/** 인라인 텍스트. 허용 마크업은 b/strong/i/em/u/s/br 로 제한한다(core/sanitize.ts). */
export const zTextPatch = z.object({ html: z.string() }).strict();
export type TextPatch = z.infer<typeof zTextPatch>;

export const zNodePatch = z.object({
  text: zTextPatch.optional(),
  style: zStylePatch.optional(),
  layout: zLayoutPatch.optional(),
  hidden: z.boolean().optional(),
  /**
   * 위계 수동 지정. 자동 추론이 틀렸을 때 사람이 바로잡는다.
   * 서식(style)이 아니라 의미이므로 서식 복사에 딸려 가지 않는다.
   * 값은 typography.ts 의 Role 이지만, 순환 참조를 피해 여기서는 문자열로만 다룬다.
   */
  role: z.string().optional(),
}).strict();
export type NodePatch = z.infer<typeof zNodePatch>;
