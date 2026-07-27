/**
 * 커맨드 적용 번들 — tools/apply.mjs 가 Node 에서 부른다.
 *
 * AI 가 장표를 고칠 때 HTML 을 다시 그리지 않고 커맨드를 발행하게 하기 위한 통로다.
 * 사람이 누르는 버튼과 같은 apply() 를 지나므로, 불변식·검증이 그대로 적용된다.
 * (docs/DECISIONS.md D2)
 *
 * 브라우저 API 를 쓰지 않는다. commands.ts 와 tree.ts 는 순수 함수뿐이라 Node 에서 그대로 돈다.
 */
import { assertSlideDoc, parseSlideDoc, type SlideDoc } from '@contract/index';
import { apply, type Command } from './commands';

export interface ApplyReport {
  doc: SlideDoc;
  applied: number;
  /** 적용 전후로 달라진 항목 요약. 사람이 결과를 확인할 수 있게. */
  changes: { patches: number; added: number; removed: number; stack: number };
}

/**
 * 문서 하나에 커맨드 목록을 순서대로 적용한다.
 * 읽을 때와 쓸 때 각각 계약을 검증한다 — 잘못된 커맨드가 파일을 망가뜨리지 못하게.
 */
export function applyCommands(raw: unknown, commands: Command[], now: string): ApplyReport {
  const before = parseSlideDoc(raw);

  // 어디서 틀렸는지 알려 주지 않으면 고칠 수가 없다. 몇 번째 커맨드인지 함께 붙인다.
  let after = before;
  commands.forEach((cmd, i) => {
    const type = (cmd as { type?: string })?.type;
    try {
      const next = apply(after, cmd);
      if (!next) throw new Error(`알 수 없는 커맨드: ${type ?? '(type 없음)'}`);
      after = next;
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      throw new Error(`${i + 1}번째 커맨드(${type ?? '?'}) 처리 중 — ${why}`);
    }
  });
  const doc = assertSlideDoc({ ...after, updatedAt: now });

  return {
    doc,
    applied: commands.length,
    changes: {
      patches: Object.keys(doc.patches).length - Object.keys(before.patches).length,
      added: Object.keys(doc.tree.added).length - Object.keys(before.tree.added).length,
      removed: doc.tree.removed.length - before.tree.removed.length,
      stack: doc.stack.length - before.stack.length,
    },
  };
}

/** 계약만 확인하고 아무것도 바꾸지 않는다. 파일이 읽히는지 볼 때 쓴다. */
export function checkDoc(raw: unknown): { ok: true; title: string } | { ok: false; error: string } {
  try {
    return { ok: true, title: parseSlideDoc(raw).title };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
