/**
 * 경계에서만 검증한다.
 *  - 읽기(스토리지·파일 임포트) 직후 1회
 *  - 쓰기(저장·내보내기) 직전 1회
 * 내부 커맨드 경로에서는 재검증하지 않는다. (타입이 이미 보증한다)
 */
import { zSlideDoc, type SlideDoc } from './schema';
import { migrate } from './migrate';

export class ContractError extends Error {
  constructor(message: string, readonly issues: string[]) {
    super(message);
    this.name = 'ContractError';
  }
}

/** 저장 데이터 → 검증된 SlideDoc. 실패하면 던진다. */
export function parseSlideDoc(raw: unknown): SlideDoc {
  const migrated = migrate(raw);
  const result = zSlideDoc.safeParse(migrated);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ContractError('저장계약 위반 — 문서를 읽을 수 없음', issues);
  }
  return result.data;
}

/** 쓰기 직전 검증. 잘못된 문서를 저장소에 넣지 않는다. */
export function assertSlideDoc(doc: SlideDoc): SlideDoc {
  return parseSlideDoc(doc);
}
