/**
 * 새로 넣는 요소의 마크업.
 *
 * KG 클래스만 쓴다. 여기에 직접 색이나 크기를 적으면 브랜드 밖으로 새므로,
 * 모양은 전부 kg-slide.css 와 위계(data-kg-role)가 정하게 둔다.
 */
import { ROLE_ATTR, type AddedKind, type AddedNode } from '@contract/index';

export interface SnippetSpec {
  kind: AddedKind;
  label: string;
  /** 삽입 기본 크기(캔버스 px) */
  size: { w: number; h: number };
  html(): string;
}

export const SNIPPETS: Record<'text' | 'box', SnippetSpec> = {
  text: {
    kind: 'text',
    label: '텍스트 상자',
    size: { w: 280, h: 44 },
    html: () => `<div class="kg-body" ${ROLE_ATTR}="body">내용 입력</div>`,
  },
  box: {
    kind: 'box',
    label: '박스',
    size: { w: 300, h: 120 },
    html: () =>
      `<div class="kg-box-tint"><div class="kg-body" ${ROLE_ATTR}="body">내용 입력</div></div>`,
  },
};

export function snippetNode(key: keyof typeof SNIPPETS): AddedNode {
  const s = SNIPPETS[key];
  return { kind: s.kind, html: s.html() };
}

/** 복제 — 복제 시점의 모습을 굳혀 원본과 독립시킨다(PPT의 복사 붙여넣기와 같은 감각). */
export function cloneNodeSnapshot(el: HTMLElement, from: string): AddedNode {
  const copy = el.cloneNode(true) as HTMLElement;
  for (const child of copy.querySelectorAll('[data-kg-id]')) {
    child.removeAttribute('data-kg-id');
    child.removeAttribute('data-kg-style0');
    child.removeAttribute('data-kg-text');
  }
  copy.removeAttribute('data-kg-id');
  copy.removeAttribute('data-kg-style0');
  copy.removeAttribute('data-kg-text');
  copy.style.removeProperty('position');
  copy.style.removeProperty('left');
  copy.style.removeProperty('top');
  copy.style.removeProperty('z-index');
  copy.style.removeProperty('transform');
  return { kind: 'copy', html: copy.outerHTML, from };
}
