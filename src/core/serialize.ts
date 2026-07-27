/**
 * 내보내기 — 문서를 다시 KG 장표 HTML 한 장으로 되돌린다.
 *
 * 렌더와 같은 경로를 쓴다(render 재사용). 내보내기 전용 분기를 만들지 않는다.
 * 화면에서 본 것과 파일로 나온 것이 갈라지지 않게 하기 위한 규칙이다.
 * 위계 전역값도 함께 실어 보내므로 내보낸 파일에서도 같은 위계 규칙이 유지된다.
 */
import type { SlideDoc } from '@contract/index';
import { render } from './render';
import { stripEditorAttrs } from './ids';
import { themeCss } from './theme';

export interface ExportOptions {
  /** KG 공통 CSS가 놓인 경로. 내보낸 파일 기준 상대경로다. */
  cssBase?: string;
  /**
   * 사본으로 낼까. 칠한 자리·사명·로고가 별표로 덮인다.
   * 기본값은 원본이다 — 실수로 안 가려진 것보다 실수로 가려진 것이 알아채기 쉽다.
   */
  mask?: boolean;
}

/**
 * 패치가 반영된 <section class="kg-slide"> 조각만 돌려준다.
 *
 * 화면 밖이지만 문서에 붙여서 그린다. 위계 추론이 계산된 서식을 읽는데,
 * 문서에 붙지 않은 요소는 계산된 서식이 없어 화면과 다른 위계가 나오기 때문이다.
 * 마스킹도 잰 크기를 쓰므로 붙여 놓아야 로고 자리가 제 크기로 남는다.
 */
export function toSlideHtml(doc: SlideDoc, opts: ExportOptions = {}): string {
  const scratch = document.createElement('div');
  scratch.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;';
  document.body.appendChild(scratch);
  try {
    const { root } = render(scratch, doc, { blind: opts.mask ? 'mask' : 'off' });
    stripEditorAttrs(root);
    return root.outerHTML;
  } finally {
    scratch.remove();
  }
}

/** 브라우저에서 바로 열리는 독립 HTML 한 장. */
export function toStandaloneHtml(doc: SlideDoc, opts: ExportOptions = {}): string {
  const base = opts.cssBase ?? './kg/';
  const title = doc.title || 'Keynes Group 장표';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${base}colors_and_type.css">
<link rel="stylesheet" href="${base}kg-slide.css">
<style>
html,body{margin:0;background:#F2F4F7;display:flex;justify-content:center;}
.kg-detached-layer{position:absolute;inset:0;pointer-events:none;}
.kg-detached-layer>*{pointer-events:auto;}
${doc.source.css}
${themeCss(doc.theme)}
</style>
</head>
<body>
${toSlideHtml(doc, opts)}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
