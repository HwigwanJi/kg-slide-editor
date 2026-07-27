/**
 * 인라인 텍스트 정제.
 * 텍스트 패치는 tiptap 출력이거나 외부에서 불러온 JSON이다. 둘 다 신뢰하지 않는다.
 * 허용 태그(ids.ts FORMAT_TAGS) 외에는 전부 텍스트로 내린다. 속성은 모두 제거한다.
 */
import { FORMAT_TAGS } from './ids';

export function sanitizeInline(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  clean(tpl.content);
  return tpl.innerHTML;
}

function clean(node: ParentNode): void {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove();
      continue;
    }
    const el = child as Element;
    if (!FORMAT_TAGS.has(el.tagName)) {
      // 허용되지 않은 태그는 껍데기만 벗기고 내용은 살린다.
      clean(el);
      el.replaceWith(...el.childNodes);
      continue;
    }
    for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
    clean(el);
  }
}
