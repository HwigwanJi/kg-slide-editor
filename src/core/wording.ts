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
 *
 * 기준이 되는 문체는 중앙부처 3급 이상이 결재한 공문서다. 판단을 늘어놓지 않고 조치를 적으며,
 * 약어와 실무 은어를 쓰지 않는다. 스킬은 사람이 안 읽고 넘어갈 수 있지만 이 검사는 넘어가지 못한다.
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
  {
    name: '판단 노출',
    // 판단을 문장 끝에 달아 두는 형태만 잡는다. "필요 인력" 같은 정상 어구를 건드리지 않도록 끝에 붙인다.
    pattern: /(?:필요|요망|시급|판단됨|사료됨|예상됨|추정됨|보임|보여짐|불가피)(?:함|성|하다|하며)?\s*$/g,
    detail: '무엇이 필요한지가 아니라 무엇을 하는지를 적는다. 판단이 아니라 조치를 쓴다.',
  },
  {
    name: '자극적 표현',
    pattern: /탈출|꼴찌|추락|폭탄|초비상|돌파구|사활|생존\s*전략|위기\s*극복/g,
    detail: '선정적 표현. 등급·순위를 자극적으로 쓰지 않고 사실과 조치로 적는다.',
  },
  {
    name: '약어·구어',
    pattern: /경평|공운법|기재부(?!\s*장관)|정출연|산출연|알박기|보여주기식|땜질/g,
    detail: '공문서는 약어를 쓰지 않는다. 첫 등장에서 정식 명칭을 쓴다.',
  },
  {
    name: '외래어 남용',
    // 정책 문서에서 굳어진 말(로드맵·모니터링 등)은 넣지 않는다. 실무 은어만 잡는다.
    pattern: /얼라인(먼트)?|싱크업|온보딩|액션\s*아이템|액션플랜|스코프|인사이트|팔로우?업|랩업|페인\s*포인트|니즈|캐파|아웃풋|인풋|그로스|임팩트|레버리지|어젠다|리소스|딜리버리|스프린트|백로그|오너십|롤아웃|디테일|커뮤니케이션|(?:전략|목표|방향성?)\s*정렬/g,
    detail: '실무 은어. 정책 문서의 표준 용어로 바꾼다.',
  },
];

/**
 * 헤더 메시지띠는 한 줄로 읽혀야 한다.
 *
 * 장표에서 가장 먼저 읽히는 한 문장이다. 두 줄로 넘어가면 띠가 두꺼워져
 * 아래 본문이 눌리고, 한눈에 들어오는 문장이라는 성격도 잃는다.
 * 공백 포함 70자를 넘기면 대개 두 줄이 된다.
 */
const MSGBAND_MAX = 70;

/**
 * 세부주제는 "무엇을 한다" 를 말해야 한다.
 *
 * 실제로 겪은 일이다. 원본의 `ADL 기반 비계량 평가 고도화` 가 옮겨지면서
 * `비계량 지표 평가관점 · 접근방법–실행–학습과 혁신` 이 되었다. 틀린 말은 없지만
 * 무엇을 하겠다는 주장이 사라지고 구성요소 나열만 남았다. 한 덱에서 13장이 그랬다.
 *
 * 아래 말 하나라도 있으면 주장이 서 있다고 본다. 정확한 판정은 사람이 하고,
 * 여기서는 "행위어가 아예 없고 가운뎃점으로만 이어 붙인" 명백한 자리만 짚는다.
 */
/*
 * **끝을 본다.** 한국어는 행위어가 맨 뒤에 온다 — "비계량 평가 고도화".
 * 어디든 들어 있기만 하면 되는 것으로 잡으면 `평가관점` 같은 명사에 걸려 검사가 헐거워진다.
 */
const ACTION_TAIL = new RegExp(
  '(고도화|구축|재구축|재설계|재정립|정립|도출|수립|재수립|강화|확대|축소|전환|개선|정비'
  + '|연계|체계화|내재화|확산|정착|이행|점검|진단|설계|재편|추진|마련|가시화|표준화|일원화'
  + '|제시|분석|평가|관리|운영|배분|매핑|선정|발굴|해소|보완|정리|통합|분리|승계|설정|지원'
  + '|검토|의견수렴|구조화|확보|제고|방안|계획|개요|로드맵|프로세스|체계|기준|모델)$',
);

/**
 * 나열 기호. 가운뎃점·슬래시에 더해 붙임표(–)도 센다.
 * `접근방법–실행–학습과 혁신` 처럼 붙임표로만 이어 붙인 자리가 실제로 있었다.
 */
const LIST_MARK = /[·/–]/g;

/** 장표 안 글자를 훑어 규칙에 걸리는 대목을 찾는다. */
export function auditWording(root: HTMLElement, slideId?: string): WordingIssue[] {
  const issues: WordingIssue[] = [];

  const band = root.querySelector('.kg-msgband');
  const message = (band?.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (message.length > MSGBAND_MAX) {
    issues.push({
      id: band?.getAttribute(ID_ATTR) ?? 'n',
      rule: '메시지띠 길이',
      hit: `${message.length}자`,
      preview: `${message.slice(0, 40)}…`,
      detail: `헤더 메시지는 공백 포함 ${MSGBAND_MAX}자 안에서 한 줄로 끝낸다. ${message.length - MSGBAND_MAX}자 줄여야 한다.`,
      ...(slideId ? { slideId } : {}),
    });
  }

  const sub = root.querySelector('.kg-section-sub');
  const subText = (sub?.textContent ?? '').trim().replace(/\s+/g, ' ');
  /*
   * 둘을 함께 본다. 나열 기호가 둘 이상이면서 행위어로 끝나지 않을 때만 짚는다.
   * 하나만 보면 헐거워진다 — 나열만 보면 `규정 제·개정 지원` 이 걸리고,
   * 끝만 보면 `핵심과제 우선순위 설정` 이 걸린다. 둘 다 멀쩡한 문구다.
   */
  const marks = (subText.match(LIST_MARK) ?? []).length;
  if (subText.length >= 10 && marks >= 2 && !ACTION_TAIL.test(subText)) {
    issues.push({
      id: sub?.getAttribute(ID_ATTR) ?? 'n',
      rule: '세부주제 — 무엇을 하는지가 없음',
      hit: `나열 ${marks}개 · 끝말 "${subText.split(/[·/–\s]/).filter(Boolean).pop() ?? ''}"`,
      preview: subText.length > 40 ? `${subText.slice(0, 40)}…` : subText,
      detail: '구성요소를 이어 붙였을 뿐 무엇을 하는지가 없다. '
        + '"…고도화" "…구축" "…재설계" 처럼 이 장이 무엇을 하는 장인지가 끝에 오게 고쳐 쓴다.',
      ...(slideId ? { slideId } : {}),
    });
  }

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
