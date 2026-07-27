/**
 * 위계 전역값 → CSS.
 *
 * 문서에 저장된 것은 "사용자가 바꾼 값"뿐이다. 바꾸지 않은 위계는 규칙을 아예 만들지 않으므로
 * KG 원본 CSS가 그대로 적용된다. 그래서 우리 코드가 KG 기본 수치를 복사해 들고 있을 필요가 없다.
 *
 * 우선순위는 CSS 캐스케이드가 처리한다.
 *   KG 원본(.kg-body)  <  위계 전역(.kg-slide [data-kg-role])  <  노드 오버라이드(인라인 style·속성)
 * "전역을 조정하면 오버라이드하지 않은 것만 따라 바뀐다"가 여기서 저절로 성립한다.
 *
 * 말머리표도 같은 세 층을 탄다.
 *   시스템 기본(DEFAULT_MARKERS) < 위계 전역(theme.roles[role].marker) < 노드(data-kg-marker)
 */
import {
  DEFAULT_MARKERS, ROLE_ATTR, ROLE_TOKENS, ROLES, toCssColor,
  type Role, type RoleStyle, type Theme,
} from '@contract/index';
import { MARKER_ATTR, MARKER_OFF_ATTR } from './ids';

/** 말머리표가 붙는 방식. 줄이 넘어가도 글자가 기호 아래로 들어가지 않게 내어쓰기를 쓴다. */
const MARKER_PRELUDE = `
.kg-slide [${MARKER_ATTR}]{text-indent:-1.05em;padding-left:1.05em;}
.kg-slide [${MARKER_ATTR}]::before{content:attr(${MARKER_ATTR}) " ";position:static;color:inherit;opacity:.72;}
.kg-slide [${MARKER_OFF_ATTR}]::before{content:none;}
.kg-slide [${MARKER_OFF_ATTR}]{text-indent:0;padding-left:0;}
`.trim();

export function themeCss(theme: Theme): string {
  const rules: string[] = [MARKER_PRELUDE];
  const scale = theme.scale ?? 1;

  for (const role of ROLES) {
    const s: RoleStyle = theme.roles?.[role] ?? {};
    const decls = declarations(role, s, scale);
    if (decls.length) rules.push(`.kg-slide [${ROLE_ATTR}="${role}"]{${decls.join('')}}`);

    const marker = markerOf(theme, role);
    if (marker) {
      // 위계 전역 말머리표. 노드가 직접 지정한 것(data-kg-marker)이 뒤에 와서 이긴다.
      rules.push(
        `.kg-slide [${ROLE_ATTR}="${role}"]:not([${MARKER_ATTR}]):not([${MARKER_OFF_ATTR}])` +
        `{text-indent:-1.05em;padding-left:1.05em;}`,
        `.kg-slide [${ROLE_ATTR}="${role}"]:not([${MARKER_ATTR}]):not([${MARKER_OFF_ATTR}])::before` +
        `{content:"${escapeContent(marker)}\\00a0";position:static;` +
        `color:${s.markerColor ? toCssColor(s.markerColor) : 'inherit'};opacity:.72;}`,
      );
    }
  }
  return rules.join('\n');
}

/** 이 위계에 실제로 걸리는 말머리표. 전역이 없으면 시스템 기본값. */
export function markerOf(theme: Theme, role: Role): string {
  return theme.roles?.[role]?.marker ?? DEFAULT_MARKERS[role];
}

function declarations(role: Role, s: RoleStyle, scale: number): string[] {
  const out: string[] = [];
  const token = ROLE_TOKENS[role].size;

  if (s.fontSize !== undefined) out.push(`font-size:${round(s.fontSize * scale)}px;`);
  else if (scale !== 1) out.push(`font-size:calc(var(${token}) * ${round(scale)});`);

  if (s.fontWeight !== undefined) out.push(`font-weight:${s.fontWeight};`);
  if (s.lineHeight !== undefined) out.push(`line-height:${round(s.lineHeight)};`);
  if (s.letterSpacing !== undefined) out.push(`letter-spacing:${round(s.letterSpacing)}em;`);
  if (s.color) out.push(`color:${toCssColor(s.color)};`);
  if (s.textAlign) out.push(`text-align:${s.textAlign};`);
  return out;
}

function escapeContent(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 한 위계가 전역에서 조정되었는가. 세팅 화면의 "초기화" 버튼 활성 조건. */
export function isRoleTouched(theme: Theme, role: Role): boolean {
  return Object.keys(theme.roles?.[role] ?? {}).length > 0;
}
