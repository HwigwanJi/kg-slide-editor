/**
 * 문구 검사 — 장표에 남은 "AI가 쓴 티"를 잡는다.
 *
 * 규칙의 뿌리는 AI-Polish 스킬(`~/.claude/skills/AI-Polish/SKILL.md`)이다.
 * 그 스킬은 사람이 읽고 판단하는 규칙집이고, 여기 있는 것은 그중 **기계가 확실히 잡을 수 있는 것만**
 * 옮긴 것이다. 판단이 필요한 것(어색한 조어, 표준 용어 여부)은 옮기지 않는다 —
 * 기계가 어설프게 잡으면 사람이 검사를 신뢰하지 않게 된다.
 *
 * 장표는 문서와 사정이 다르다. KG 장표는 원문자(①②)와 화살표(→)를 도해에 쓰므로
 * 그것까지 장식 기호로 잡으면 경고만 쏟아진다. 여기서는 뺀다.
 */
import type { NodeId } from '@contract/index';
import { ID_ATTR, SLOT_CLASS, TEXT_ATTR } from './ids';

export interface WordingIssue {
  id: NodeId;
  slideId?: string;
  /** 어떤 규칙에 걸렸는가 */
  rule: string;
  /** 걸린 대목 */
  hit: string;
  preview: string;
  detail: string;
}

interface Rule {
  name: string;
  pattern: RegExp;
  detail: string;
}

const RULES: Rule[] = [
  {
    name: '장식 기호',
    // 원문자·화살표·가운뎃점은 KG 도해가 쓰므로 뺀다. 강조용 장식만 잡는다.
    pattern: /[▣■◆◇▶★☆※✓✗➤➔]|[─═]{3,}/g,
    detail: '강조용 장식 기호. 굵게 처리하거나 번호 체계로 바꾼다.',
  },
  {
    name: '완성형 종결',
    pattern: /(합니다|입니다|습니다|됩니다|드립니다)(?=[\s.,)\]]|$)/g,
    detail: '보고서체는 명사형으로 끝낸다. "제공함" "확보" 처럼.',
  },
  {
    name: '자기변명',
    pattern: /이 아니라|다만 본|한계가 있|참고용으로|추가 검증이 필요|의도적으로 제외/g,
    detail: '묻지 않은 변명. 사실만 적고 한계는 별도 항목으로 뺀다.',
  },
  {
    name: 'AI 작업 흔적',
    pattern: /자동 (추천|산출|생성|분류)|산출 로직|빌드 정보|생성 시각/g,
    detail: '작성 방법을 드러내지 않는다. 결과만 적는다.',
  },
  {
    name: '친절조',
    pattern: /해 주십시오|보시기 바랍니다|참고로|쉽게 말하면|라고 보면 됩니다/g,
    detail: '설명조를 걷어내고 사실 진술로 바꾼다.',
  },
  {
    name: '과장',
    pattern: /사상 최초|최초의|혁신적|획기적|압도적|극대화/g,
    detail: '자기 평가는 빼고 근거만 남긴다. 판단은 발주처가 한다.',
  },
  {
    name: '영문 과잉',
    pattern: /\bTop\s*\d+|\bMVP\b|\bTo-?Be\b|\bAs-?Is\b(?![ ·—])/gi,
    detail: '한국어 본문에 영문 단독 표기. 한글 우선 + 괄호 병기로 바꾼다.',
  },
];

/** 장표 안 글자를 훑어 규칙에 걸리는 대목을 찾는다. */
export function auditWording(root: HTMLElement, slideId?: string): WordingIssue[] {
  const issues: WordingIssue[] = [];

  for (const el of root.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`)) {
    if (el.closest(`.${SLOT_CLASS}`)) continue;
    const id = el.getAttribute(ID_ATTR);
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (!id || !text) continue;

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      const found = [...new Set([...text.matchAll(rule.pattern)].map((m) => m[0]))];
      for (const hit of found) {
        issues.push({
          id, rule: rule.name, hit,
          preview: text.length > 40 ? `${text.slice(0, 40)}…` : text,
          detail: rule.detail,
          ...(slideId ? { slideId } : {}),
        });
      }
    }
  }
  return issues;
}
