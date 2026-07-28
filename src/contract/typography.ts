/**
 * 위계(role) — 글자 구조를 클래스가 아니라 역할로 다룬다. SSOT.
 *
 * 왜 필요한가
 *  장표의 글자는 "이 요소만 18px" 이 아니라 "본문 1단은 17px, 소주제는 22px" 이라는 위계로
 *  관리해야 한 장 안에서, 그리고 덱 전체에서 일관성이 유지된다.
 *
 * 값의 진실은 어디 있나 — 세 층으로 나눈다. 아래로 갈수록 강하다.
 *  1) KG 기본값   public/kg/colors_and_type.css 의 --fs-* / 색 토큰. 우리 코드에 숫자를 복사하지 않는다.
 *  2) 문서 전역   SlideDoc.theme. 사용자가 조정한 값만 CSS 로 생성된다.
 *  3) 노드 개별   patches[id].style. 인라인 스타일이라 항상 이긴다 = 오버라이드.
 *
 * 위계를 어떻게 정하는가
 *  글자가 있는 요소는 예외 없이 위계 하나를 갖는다. "지정 없음"은 존재하지 않는다.
 *  우선순위는 (1) 장표가 직접 붙인 data-kg-role → (2) KG 클래스 매칭 → (3) 구조 추론 → (4) body1.
 *  추론이 틀리면 사람이 속성 패널에서 바꾼다(patches[id].role).
 */
import { z } from 'zod';
import { zColorRef, zFontWeight, zTextAlign } from './style';

export const zRole = z.enum([
  'title',     // 섹션 제목 (헤더)
  'subtitle',  // 세부 주제 (헤더)
  'message',   // 헤더 메시지 띠 — 장표의 핵심 주장
  'h1',        // 소주제 (본문 영역 제목)
  'h2',        // 박스 제목바
  'h3',        // 유목화 키워드 / 박스 안 소제목
  'body1',     // 본문 1단 — 주 설명
  'body2',     // 본문 2단 — 하위 항목
  'body3',     // 본문 3단 — 하위의 하위
  'body4',     // 본문 4단 — 최말단 부연
  'caption',   // 각주·출처·단위
  'label',     // 태그·칩 (강조)
  'label2',    // 보조 태그·단위 (비활성 칩, 축약 표기)
  'num',       // 번호 라벨 (원문자, 코너 번호, 단계 번호)
]);
export type Role = z.infer<typeof zRole>;

export const ROLES = zRole.options;
/** 본문 계열만. 단계 조정 UI가 이 순서를 쓴다. */
export const BODY_ROLES: Role[] = ['body1', 'body2', 'body3', 'body4'];

/**
 * 말머리표.
 * 빈 문자열이면 붙이지 않는다. `null` 은 "상위 층 값을 쓰지 않고 끈다"는 뜻이다.
 * 값은 기호 한두 글자를 기대한다(– · ▪ ‧ ※ 등). 뒤 여백은 렌더가 붙인다.
 */
export const zMarker = z.string().max(4);

export const zRoleStyle = z.object({
  fontSize: z.number().min(8).max(96).optional(),
  fontWeight: zFontWeight.optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  letterSpacing: z.number().min(-0.1).max(0.5).optional(),
  color: zColorRef.optional(),
  textAlign: zTextAlign.optional(),
  /** 이 위계의 말머리표. 빈 문자열이면 없음. */
  marker: zMarker.optional(),
  markerColor: zColorRef.optional(),
}).strict();
export type RoleStyle = z.infer<typeof zRoleStyle>;

export const zTheme = z.object({
  /** 전역 배율. 위계별 크기를 따로 정하지 않아도 한 손잡이로 전체를 키우고 줄인다. */
  scale: z.number().min(0.6).max(1.6).default(1),
  /** 사용자가 바꾼 위계만 담긴다. 손대지 않은 위계는 키 자체가 없다. */
  roles: z.partialRecord(zRole, zRoleStyle).default({}),
}).strict();
export type Theme = z.infer<typeof zTheme>;

export const DEFAULT_THEME: Theme = { scale: 1, roles: {} };

/**
 * 시스템 기본 말머리표 — 프로젝트가 아무것도 정하지 않았을 때의 값.
 *
 * 전부 비워 둔 이유: KG 템플릿은 필요한 자리에 이미 자기 말머리표를 그려 두었고,
 * 여기서 기본값을 켜면 기존 장표에 없던 기호가 갑자기 붙는다.
 * 프로젝트에서 위계별로 켜는 것이 맞다(위계 설정 패널).
 */
export const DEFAULT_MARKERS: Record<Role, string> = {
  title: '', subtitle: '', message: '', h1: '', h2: '', h3: '',
  body1: '', body2: '', body3: '', body4: '',
  caption: '', label: '', label2: '', num: '',
};

/** 말머리표 고르기 UI 가 제시하는 후보. 공공기관 보고서에서 쓰는 기호로 한정한다. */
export const MARKER_PRESETS: [string, string][] = [
  ['', '없음'],
  ['·', '가운뎃점'],
  ['–', '짧은 줄표'],
  ['▪', '채운 사각'],
  ['□', '빈 사각'],
  ['○', '빈 원'],
  ['※', '참고표'],
];

/**
 * 위계 ↔ KG 토큰 대응.
 * 값이 아니라 토큰 이름만 적는다. 실제 숫자는 KG CSS 가 계속 소유한다.
 * 전역 배율은 calc(var(--fs-*) * scale) 로 걸리므로 크기를 따로 정하지 않아도 동작한다.
 */
export const ROLE_TOKENS: Record<Role, { size: string; color: string; label: string }> = {
  title:    { size: '--fs-section-title', color: '--paper',    label: '섹션 제목' },
  subtitle: { size: '--fs-section-sub',   color: '--blue-300', label: '세부 주제' },
  message:  { size: '--fs-msg',           color: '--navy-800', label: '헤더 메시지' },
  h1:       { size: '--fs-subtopic',      color: '--ink-navy', label: '소주제' },
  h2:       { size: '--fs-box-title',     color: '--ink-navy', label: '박스 제목' },
  h3:       { size: '--fs-body',          color: '--ink-navy', label: '키워드·소제목' },
  body1:    { size: '--fs-body',          color: '--ink-900',  label: '본문 1단' },
  body2:    { size: '--fs-small',         color: '--ink-700',  label: '본문 2단' },
  body3:    { size: '--fs-caption',       color: '--ink-700',  label: '본문 3단' },
  body4:    { size: '--fs-caption',       color: '--ink-500',  label: '본문 4단' },
  caption:  { size: '--fs-caption',       color: '--ink-500',  label: '각주·출처' },
  label:    { size: '--fs-tag',           color: '--ink-navy', label: '태그 (강조)' },
  label2:   { size: '--fs-caption',       color: '--ink-500',  label: '태그 (보조)' },
  num:      { size: '--fs-tag',           color: '--paper',    label: '번호 라벨' },
};

/**
 * KG 클래스 → 위계. 위에서부터 먼저 맞는 것을 쓴다(구체적인 것이 위).
 * 여기에 없는 요소는 core/ids.ts 의 구조 추론이 맡는다.
 */
export const ROLE_SELECTORS: [string, Role][] = [
  ['.kg-section-title', 'title'],
  ['.kg-section-sub', 'subtitle'],
  // 좌상단 섹션 번호는 제목과 한 덩어리다. 크기를 함께 움직여야 헤더가 어긋나지 않는다.
  ['.kg-section-num', 'title'],
  ['.kg-message', 'message'],
  ['.kg-area-title .kg-body-title', 'h1'],
  ['.kg-subtopic', 'h1'],
  ['.kg-body-title', 'h1'],
  ['.kg-card__bar', 'h2'],
  ['.kg-box-title', 'h2'],
  ['.kg-box-h', 'h2'],
  ['.kg-grp__k', 'h3'],
  ['.kg-colhead', 'h3'],
  ['.kg-body', 'body1'],
  ['.kg-interp', 'body2'],
  ['.kg-grp__c li', 'body2'],
  ['.kg-small', 'body2'],
  ['.kg-caption', 'caption'],
  ['.kg-footer__src', 'caption'],
  ['.kg-footer__page', 'caption'],
  ['.kg-chapter-tag', 'label'],
  ['.kg-chapter-tab__roman', 'num'],
  ['.kg-num-label', 'num'],
  ['.kg-numdot', 'num'],
  ['.kg-cornern', 'num'],
];

/** 번호로 보이는 짧은 표기. 원문자·로마숫자·아라비아 숫자만. */
export const NUMERIC_LABEL = /^[\s.·)\]]*(?:[0-9]{1,2}|[①-⑳]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[IVXivx]{1,4}|[A-Za-z])[\s.·)\]]*$/;

export const ROLE_ATTR = 'data-kg-role';

/** 본문 단계를 자른다. 추론이 범위를 넘어도 항상 유효한 위계가 나온다. */
export function bodyRole(level: number): Role {
  return BODY_ROLES[Math.min(BODY_ROLES.length, Math.max(1, level)) - 1]!;
}
