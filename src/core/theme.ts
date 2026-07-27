/**
 * 위계 전역값 → CSS.
 *
 * 문서에 저장된 것은 "사용자가 바꾼 값"뿐이다. 바꾸지 않은 위계는 규칙을 아예 만들지 않으므로
 * KG 원본 CSS가 그대로 적용된다. 그래서 우리 코드가 KG 기본 수치를 복사해 들고 있을 필요가 없다.
 *
 * 우선순위는 CSS 캐스케이드가 처리한다.
 *   KG 원본(.kg-body)  <  위계 전역(.kg-slide [data-kg-role])  <  노드 오버라이드(인라인 style)
 * "전역을 조정하면 오버라이드하지 않은 것만 따라 바뀐다"가 여기서 저절로 성립한다.
 */
import { ROLE_ATTR, ROLE_TOKENS, toCssColor, type Role, type RoleStyle, type Theme } from '@contract/index';

export function themeCss(theme: Theme): string {
  const rules: string[] = [];
  const scale = theme.scale ?? 1;

  for (const role of Object.keys(ROLE_TOKENS) as Role[]) {
    const s: RoleStyle = theme.roles?.[role] ?? {};
    const decls = declarations(role, s, scale);
    if (decls.length) rules.push(`.kg-slide [${ROLE_ATTR}="${role}"]{${decls.join('')}}`);
  }
  return rules.join('\n');
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

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 한 위계가 전역에서 조정되었는가. 세팅 화면의 "초기화" 버튼 활성 조건. */
export function isRoleTouched(theme: Theme, role: Role): boolean {
  return Object.keys(theme.roles?.[role] ?? {}).length > 0;
}
