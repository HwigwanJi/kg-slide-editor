/**
 * 위계(role) — 글자 구조를 클래스가 아니라 역할로 다룬다. SSOT.
 *
 * 왜 필요한가
 *  장표의 글자는 "이 요소만 18px" 이 아니라 "본문은 17px, 소주제는 22px" 이라는 위계로 관리해야
 *  한 장 안에서, 그리고 덱 전체에서 일관성이 유지된다. 노드마다 크기를 손으로 맞추면 곧 무너진다.
 *
 * 값의 진실은 어디 있나 — 세 층으로 나눈다. 아래로 갈수록 강하다.
 *  1) KG 기본값   public/kg/colors_and_type.css 의 --fs-* / 색 토큰. 우리 코드에 숫자를 복사하지 않는다.
 *  2) 문서 전역   SlideDoc.theme. 사용자가 프로젝트 세팅에서 조정한 값만 CSS 로 생성된다.
 *  3) 노드 개별   patches[id].style. 인라인 스타일이라 항상 이긴다 = 오버라이드.
 *
 *  그래서 "전역을 조정하면 오버라이드하지 않은 것만 따라 바뀐다"가 CSS 캐스케이드로 저절로 성립한다.
 *  "시스템 초기값으로 복구"는 3층을 지우는 것(clearStyle), "전역 초기화"는 2층을 비우는 것이다.
 */
import { z } from 'zod';
import { zColorRef, zFontWeight, zTextAlign } from './style';

export const zRole = z.enum([
  'title',     // 섹션 제목 (헤더)
  'subtitle',  // 세부 주제 (헤더)
  'message',   // 헤더 메시지 띠 — 장표의 핵심 주장
  'h1',        // 소주제 (본문 영역 제목)
  'h2',        // 박스 제목바
  'h3',        // 유목화 키워드
  'body',      // 본문
  'small',     // 보조 설명
  'caption',   // 각주·출처·단위
  'label',     // 태그·칩·번호 라벨
]);
export type Role = z.infer<typeof zRole>;

/** 위계별로 조정할 수 있는 값. 지정하지 않은 항목은 KG 기본값이 그대로 쓰인다. */
export const zRoleStyle = z.object({
  fontSize: z.number().min(8).max(96).optional(),
  fontWeight: zFontWeight.optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  letterSpacing: z.number().min(-0.1).max(0.5).optional(),
  color: zColorRef.optional(),
  textAlign: zTextAlign.optional(),
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
  h3:       { size: '--fs-body',          color: '--ink-navy', label: '유목화 키워드' },
  body:     { size: '--fs-body',          color: '--ink-900',  label: '본문' },
  small:    { size: '--fs-small',         color: '--ink-700',  label: '보조 설명' },
  caption:  { size: '--fs-caption',       color: '--ink-500',  label: '각주·출처' },
  label:    { size: '--fs-tag',           color: '--ink-navy', label: '태그·라벨' },
};

/**
 * KG 클래스 → 위계. 임포트할 때 이 표로 각 요소에 data-kg-role 을 찍는다.
 * 위에서부터 먼저 맞는 것을 쓴다(구체적인 것이 위).
 */
export const ROLE_SELECTORS: [string, Role][] = [
  ['.kg-section-title', 'title'],
  ['.kg-section-sub', 'subtitle'],
  ['.kg-message', 'message'],
  ['.kg-area-title .kg-body-title', 'h1'],
  ['.kg-subtopic', 'h1'],
  ['.kg-body-title', 'h1'],
  ['.kg-card__bar', 'h2'],
  ['.kg-box-title', 'h2'],
  ['.kg-box-h', 'h2'],
  ['.kg-grp__k', 'h3'],
  ['.kg-colhead', 'h3'],
  ['.kg-body', 'body'],
  ['.kg-grp__c li', 'small'],
  ['.kg-small', 'small'],
  ['.kg-caption', 'caption'],
  ['.kg-footer__src', 'caption'],
  ['.kg-chapter-tag', 'label'],
  ['.kg-num-label', 'label'],
  ['.kg-numdot', 'label'],
];

export const ROLE_ATTR = 'data-kg-role';
