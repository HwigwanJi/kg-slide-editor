/**
 * 검사 도구용 번들 진입점.
 *
 * tools/lint.mjs 가 브라우저 안에 이 번들을 넣고 부른다.
 * 검사 규칙을 도구 쪽에 다시 구현하면 편집기 화면과 검사 결과가 곧 갈라진다.
 * 그래서 규칙은 코어 하나만 두고, 도구는 그것을 실행만 한다.
 */
import { parseSettings, parseSlideDoc, type ProjectSettings } from '@contract/index';
import {
  blindTargets, listBlind, scanBlindCandidates,
  type BlindCandidate, type BlindItem,
} from './blind';
import { ID_ATTR, ROLE_ATTR_PUBLIC, SLOT_ATTR, TEXT_ATTR, stampIds } from './ids';
import { render } from './render';
import { placeByOrigin, reconcileSlides } from './deck';
import { carryOverlay, formatCarry } from './merge';
import { kindOf } from './neighbors';
import { auditOverflow, type OverflowIssue } from './overflow';
import { toStandaloneHtml } from './serialize';
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

/** 적재 순서 규칙. 도구가 다시 구현하면 편집기와 갈라진다. */
export { placeByOrigin, reconcileSlides };

/**
 * 새로 그린 원본을 기존 문서 위에 얹는다.
 * prev 가 없으면 새 문서다. 있으면 사람이 쌓은 편집분을 이어 붙이고 무엇을 잇지 못했는지 알린다.
 */
export function mergeIngest(next: unknown, prev: unknown): { doc: unknown; note: string } {
  if (!prev) return { doc: next, note: '새 장표' };
  const { doc, report } = carryOverlay(prev as never, next as never);
  return { doc, note: formatCarry(report) };
}

/**
 * 지금 모습을 HTML 로 굽는다.
 *
 * 원본(source)은 작도한 그대로고, 사람이 고친 것은 덧씌움으로 따로 쌓인다.
 * 그래서 원본 파일만 읽으면 사람이 무엇을 바꿔 놨는지 보이지 않는다.
 * AI 가 이어서 고치려면 원본이 아니라 지금 모습을 읽어야 한다.
 */
export function currentHtml(raw: unknown, cssBase?: string, opts: { mask?: boolean } = {}): string {
  return toStandaloneHtml(parseSlideDoc(raw), {
    ...(cssBase ? { cssBase } : {}),
    ...(opts.mask ? { mask: true } : {}),
  });
}

/**
 * 이 장표에서 가려질 자리. 내보내기 전에 몇 곳인지 세어 보려고 둔다.
 *
 * 사본을 내기 전에 "정말 가려졌는가" 를 확인할 방법이 없으면 파일을 열어 눈으로 세는 수밖에 없다.
 * 53장을 그렇게 볼 수는 없다.
 */
export function blindReport(raw: unknown): { count: number; items: BlindItem[] } {
  const doc = parseSlideDoc(raw);
  const root = document.querySelector<HTMLElement>('.kg-slide');
  if (!root) return { count: blindTargets(doc).length, items: [] };
  const items = listBlind(root, doc);
  return { count: items.length, items };
}

/**
 * 블라인드 후보 훑기 — AI 가 사람에게 판단을 받으려고 목록을 만들 때 쓴다.
 * 그려서 본다. 원본만 읽으면 사람이 나중에 적어 넣은 이름이 빠진다.
 */
export function blindScan(raw: unknown): BlindCandidate[] {
  const doc = parseSlideDoc(raw);
  const scratch = document.createElement('div');
  scratch.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;';
  document.body.appendChild(scratch);
  try {
    const { root } = render(scratch, doc);
    return scanBlindCandidates(root, doc);
  } finally {
    scratch.remove();
  }
}
