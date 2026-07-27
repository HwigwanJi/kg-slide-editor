/**
 * 넘침 감사 — 박스 밖으로 밀려난 글자를 찾아낸다.
 *
 * 고밀도 장표에서 가장 자주 나는 사고다. 글자를 조금 고치면 박스 안에서 잘리거나
 * 장표 경계를 넘는데, 화면에서는 잘린 줄이 그냥 안 보이므로 알아채기 어렵다.
 * 그래서 전수 검사와 일괄 보정을 함께 둔다.
 *
 * 판정은 살아 있는 DOM 측정으로만 한다. 문서만 보고는 알 수 없는 값이기 때문이다.
 */
import type { NodeId } from '@contract/index';
import { ID_ATTR, SLOT_CLASS, TEXT_ATTR } from './ids';

export type OverflowKind = 'clipped' | 'outside';

export interface OverflowIssue {
  id: NodeId;
  kind: OverflowKind;
  /** 넘친 양(px). 세로·가로 각각. */
  overY: number;
  overX: number;
  /** 무엇이 넘쳤는지 알아보기 위한 앞부분 글자 */
  preview: string;
}

/** 1px 미만은 반올림 오차로 본다. */
const EPS = 1;

export function auditOverflow(root: HTMLElement): OverflowIssue[] {
  const issues: OverflowIssue[] = [];
  const slide = root.getBoundingClientRect();

  for (const el of root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)) {
    if (el.closest(`.${SLOT_CLASS}`)) continue;
    const id = el.getAttribute(ID_ATTR)!;

    // 1) 박스 안에서 잘림 — 넘침을 감추는 요소이거나 글자 런일 때만 본다.
    const overflowHidden = getComputedStyle(el).overflow !== 'visible';
    if (overflowHidden || el.hasAttribute(TEXT_ATTR)) {
      const overY = el.scrollHeight - el.clientHeight;
      const overX = el.scrollWidth - el.clientWidth;
      if (overY > EPS || overX > EPS) {
        issues.push({ id, kind: 'clipped', overY: Math.max(0, overY), overX: Math.max(0, overX), preview: preview(el) });
        continue;
      }
    }

    // 2) 장표 경계 밖 — 떼어낸 요소를 끌다가 밀려난 경우
    const r = el.getBoundingClientRect();
    const outX = Math.max(0, r.right - slide.right, slide.left - r.left);
    const outY = Math.max(0, r.bottom - slide.bottom, slide.top - r.top);
    if (outX > EPS || outY > EPS) {
      issues.push({ id, kind: 'outside', overY: Math.round(outY), overX: Math.round(outX), preview: preview(el) });
    }
  }
  return issues;
}

function preview(el: HTMLElement): string {
  return (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
}

/**
 * 글자를 줄여 박스에 맞추는 최소 크기를 찾는다.
 * 실제로 요소에 값을 넣어 보면서 측정하고, 끝나면 원래대로 되돌린다.
 * 찾지 못하면 null — 이때는 글자가 아니라 박스를 키우거나 내용을 줄여야 한다.
 *
 * @param floor 더 줄이지 않을 하한. KG 최저 기준선(16px)보다 작게 가지 않는 것이 원칙이다.
 */
export function fitFontSize(el: HTMLElement, floor = 13): number | null {
  const original = el.style.fontSize;
  const start = parseFloat(getComputedStyle(el).fontSize);
  try {
    for (let size = start; size >= floor; size -= 0.5) {
      el.style.fontSize = `${size}px`;
      if (el.scrollHeight - el.clientHeight <= EPS && el.scrollWidth - el.clientWidth <= EPS) {
        return size === start ? null : Math.round(size * 10) / 10;
      }
    }
    return null;
  } finally {
    el.style.fontSize = original;
  }
}
