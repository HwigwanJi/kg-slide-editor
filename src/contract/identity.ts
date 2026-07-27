/**
 * 식별자 규칙 — 계약 전체가 공유한다.
 *
 * 세 종류뿐이다.
 *  - 원본 노드   `n.2.1.0`   구조 경로. 원본 HTML에서 계산하므로 다시 그려도 같다.
 *  - 추가 노드   `a3f9c1d2`  원본에 없던 것(삽입·복제). 하위는 `a3f9c1d2.0.1`.
 *  - 그룹        `g7b2e004`  노드가 아니다. 렌더되지 않고 묶음만 나타낸다.
 *
 * 접두사로 종류를 구분하는 이유: 삭제 규칙이 종류마다 다르기 때문이다.
 * 원본 노드는 지울 수 없어 묘비를 남기고, 추가 노드는 실제로 지운다. (tree.ts 참조)
 */
import { z } from 'zod';

export const zNodeId = z.string().regex(
  /^(n|a[0-9a-z]{8})(\.\d+)*(\.s\d+)?$/,
  'NodeId 는 n[.index]* 또는 a<8자>[.index]* 형식이며, 도형 슬롯은 끝에 .s<번호>가 붙는다',
);
export const zGroupId = z.string().regex(/^g[0-9a-z]{8}$/, 'GroupId 는 g<8자> 형식이다');

export type NodeId = z.infer<typeof zNodeId>;
export type GroupId = z.infer<typeof zGroupId>;

/** 원본 트리의 루트 */
export const ROOT_ID = 'n';

export function isAdded(id: NodeId): boolean {
  return id.startsWith('a');
}

/** id 가 ancestor 자신이거나 그 하위인가. 묘비의 서브트리 판정에 쓴다. */
export function isDescendant(id: NodeId, ancestor: NodeId): boolean {
  return id === ancestor || id.startsWith(`${ancestor}.`);
}

/** 추가 노드 id 생성. 순수 함수여야 하는 커맨드 밖(액션 계층)에서만 부른다. */
export function newNodeId(): NodeId {
  return `a${rand()}`;
}

export function newGroupId(): GroupId {
  return `g${rand()}`;
}

function rand(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}
