/**
 * 계약 버전 이관.
 * 새 버전을 낼 때 schema.ts 의 CONTRACT_VERSION 을 올리고 여기에 규칙 하나를 추가한다.
 * 규칙은 "버전 n 문서를 n+1 문서로 바꾸는 순수 함수"다.
 */
import { CONTRACT_VERSION } from './schema';
import { EMPTY_TREE } from './tree';
import { DEFAULT_THEME } from './typography';

type RawDoc = Record<string, unknown>;

/** key = 출발 버전. MIGRATIONS[1] 은 v1 → v2 변환이다. */
const MIGRATIONS: Record<number, (doc: RawDoc) => RawDoc> = {
  /** v1 → v2 : 구조 오버레이(tree)와 위계 전역값(theme) 도입. 기존 문서는 둘 다 비어 있다. */
  1: (d) => ({ ...d, v: 2, tree: { ...EMPTY_TREE }, theme: { ...DEFAULT_THEME, roles: {} } }),
};

export class ContractVersionError extends Error {
  constructor(readonly found: unknown) {
    super(`알 수 없는 저장계약 버전: ${String(found)} (현재 ${CONTRACT_VERSION})`);
    this.name = 'ContractVersionError';
  }
}

/** 임의의 저장 데이터를 현재 버전 형태까지 끌어올린다. 검증은 validate.ts 가 맡는다. */
export function migrate(raw: unknown): RawDoc {
  if (typeof raw !== 'object' || raw === null) throw new ContractVersionError(raw);
  let doc = raw as RawDoc;
  let v = typeof doc['v'] === 'number' ? (doc['v'] as number) : NaN;
  if (!Number.isInteger(v) || v < 1) throw new ContractVersionError(doc['v']);

  while (v < CONTRACT_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new ContractVersionError(v);
    doc = step(doc);
    v = doc['v'] as number;
  }
  if (v > CONTRACT_VERSION) throw new ContractVersionError(v);
  return doc;
}
