/**
 * 검사 도구용 번들 진입점.
 *
 * tools/lint.mjs 가 브라우저 안에 이 번들을 넣고 부른다.
 * 검사 규칙을 도구 쪽에 다시 구현하면 편집기 화면과 검사 결과가 곧 갈라진다.
 * 그래서 규칙은 코어 하나만 두고, 도구는 그것을 실행만 한다.
 */
import { parseSettings, type ProjectSettings } from '@contract/index';
import { ID_ATTR, ROLE_ATTR_PUBLIC, SLOT_ATTR, TEXT_ATTR, stampIds } from './ids';
import { kindOf } from './neighbors';
import { auditOverflow, type OverflowIssue } from './overflow';
import { auditWording, type WordingIssue } from './wording';
import { importKgHtml } from '@adapters/import.kghtml';

export interface SlideReport {
  issues: OverflowIssue[];
  /** 문구에 남은 AI 티 — AI-Polish 규칙 중 기계가 잡을 수 있는 것 */
  wording: WordingIssue[];
  /** 글자가 있는데 위계가 붙지 않은 요소 — 있으면 안 된다 */
  missingRole: string[];
  textRuns: number;
  nodes: number;
  /** 사람이 집을 수 있는 개체 수. 묶음 껍데기는 배경이라 세지 않는다. */
  pickable: number;
}

/**
 * 집히는 개체 수.
 *
 * 포인터는 글자와 도형만 집고 묶음 껍데기는 배경으로 흘린다. 이 판정이 무너지면
 * 개체가 통째로 안 집히는데 화면만 봐서는 알아채기 어렵다. 그래서 세어 두고 검사 결과에 싣는다.
 */
function countPickable(root: HTMLElement): number {
  let n = 0;
  for (const el of root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)) {
    if (kindOf(el) !== 'group') n++;
  }
  return n;
}

/** 지금 열려 있는 장표를 검사한다. 설정은 kg.config.json 내용을 그대로 넘긴다. */
export function auditPage(rawSettings: unknown): SlideReport {
  const { settings } = parseSettings(rawSettings);
  const root = document.querySelector<HTMLElement>('.kg-slide');
  if (!root) throw new Error('.kg-slide 를 찾지 못했습니다');

  stampIds(root);

  const runs = [...root.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`)];
  return {
    issues: auditOverflow(root, undefined, settings as ProjectSettings),
    wording: auditWording(root),
    missingRole: runs
      // 도형 슬롯은 KG 위계 CSS 의 사정권 밖이라 위계를 붙이지 않는다(docs/SVG.md).
      .filter((el) => !el.hasAttribute(SLOT_ATTR) && !el.getAttribute(ROLE_ATTR_PUBLIC))
      .map((el) => el.getAttribute(ID_ATTR) ?? '?'),
    textRuns: runs.length,
    pickable: countPickable(root),
    nodes: root.querySelectorAll(`[${ID_ATTR}]`).length,
  };
}

/**
 * KG 장표 HTML → 저장 문서.
 * 3단계 적재(tools/ingest.mjs)가 브라우저 안에서 부른다.
 * 임포트 규칙을 도구에 다시 쓰지 않기 위해 편집기 어댑터를 그대로 쓴다.
 */
export function ingestHtml(html: string, origin: string, id: string, now: string) {
  return importKgHtml(html, { origin, id, now });
}
