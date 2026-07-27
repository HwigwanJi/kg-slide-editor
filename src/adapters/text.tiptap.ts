/**
 * 인라인 텍스트 편집 — tiptap.
 *
 * 스키마를 인라인 전용으로 좁힌 이유: KG 장표의 글자 요소는 대부분 한 줄짜리 런이고,
 * 기본 스키마를 쓰면 <p> 가 끼어들어 장표 여백이 틀어진다.
 * 허용 마크는 core/ids.ts 의 FORMAT_TAGS 와 같은 집합으로 맞춘다.
 */
import { Editor, type Extensions } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Underline from '@tiptap/extension-underline';
import HardBreak from '@tiptap/extension-hard-break';
import { UndoRedo } from '@tiptap/extensions';
import { sanitizeInline } from '@core/index';

/** 블록 없이 인라인만 담는 최상위 노드. */
const InlineDocument = Document.extend({ content: 'inline*' });

/** 확장 목록. 서식 버튼을 늘릴 때 여기와 FORMAT_TAGS 를 함께 고친다. */
export const inlineExtensions: Extensions = [
  InlineDocument,
  Text,
  HardBreak,
  Bold,
  Italic,
  Underline,
  Strike,
  UndoRedo,
];

/** 편집 중임을 나타내는 표시. 커서·아웃라인 스타일이 이 속성을 본다. */
export const EDITING_ATTR = 'data-kg-editing';

export interface TextSessionOptions {
  /** 확정 시 호출. 정제된 인라인 HTML이 넘어온다. */
  onCommit(html: string): void;
  /** 타이핑 중 호출(선택). 미리보기·자동저장용. */
  onInput?(html: string): void;
  onCancel?(): void;
}

export interface TextSession {
  readonly element: HTMLElement;
  readonly editor: Editor;
  commit(): void;
  cancel(): void;
}

/**
 * 요소 자리에서 바로 편집을 연다.
 * 원본 마크업을 백업해 두고, 취소하면 그대로 되돌린다.
 */
export function editText(el: HTMLElement, opts: TextSessionOptions): TextSession {
  const original = el.innerHTML;
  let closed = false;

  el.setAttribute(EDITING_ATTR, '');
  el.innerHTML = '';

  const editor = new Editor({
    element: el,
    extensions: inlineExtensions,
    content: original,
    autofocus: 'end',
    onUpdate: ({ editor: e }) => opts.onInput?.(sanitizeInline(e.getHTML())),
  });

  const close = (html: string) => {
    if (closed) return;
    closed = true;
    editor.destroy();
    el.removeAttribute(EDITING_ATTR);
    el.innerHTML = html;
  };

  const session: TextSession = {
    element: el,
    editor,
    commit() {
      if (closed) return;
      const html = sanitizeInline(editor.getHTML());
      close(html);
      opts.onCommit(html);
    },
    cancel() {
      if (closed) return;
      close(original);
      opts.onCancel?.();
    },
  };

  editor.view.dom.addEventListener('blur', () => session.commit());
  editor.view.dom.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      session.cancel();
    }
  });

  return session;
}
