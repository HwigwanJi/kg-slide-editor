/**
 * 구조 오버레이 — 존재(존재하는가·어디 속하는가)만 다룬다. SSOT.
 *
 * patches 는 "어떻게 보이는가"(글자·서식·좌표), tree 는 "있는가·묶였는가"를 맡는다.
 * 둘을 한 곳에 섞으면 삭제가 곧바로 무너진다. 삭제된 노드에 서식 패치가 남고,
 * 되살릴 때 무엇을 복구해야 하는지 아무도 모르게 되기 때문이다.
 *
 * 삭제 규칙 (이 계약에서 가장 까다로운 지점)
 *  - 원본 노드는 지울 수 없다. source.html 이 불변이므로 `removed` 에 묘비만 남긴다.
 *    묘비가 남는 동안에도 그 노드의 patches 는 보존된다. 되살리면 서식까지 그대로 돌아온다.
 *  - 추가 노드는 오버레이에만 있으므로 실제로 지운다. 묘비를 남기지 않는다.
 *  - 부모를 지우면 자손은 묘비를 따로 남기지 않는다. 렌더가 서브트리째 제외한다.
 *
 * 불변식은 core/tree.ts 의 normalize() 한 곳에서만 강제한다.
 */
import { z } from 'zod';
import { zGroupId, zNodeId } from './identity';

/** 추가 노드의 종류. 어떤 마크업으로 실체화할지가 달라진다. */
export const zAddedKind = z.enum([
  'text',  // 빈 텍스트 상자
  'box',   // KG 박스(연한 영역)
  'copy',  // 기존 노드 복제 — 복제 시점의 모습을 그대로 굳힌다
  'shape', // 라이브러리에서 가져온 도형(SVG)
]);

export const zAddedNode = z.object({
  kind: zAddedKind,
  /** 실체화할 마크업. 복제는 복제 시점 outerHTML 을 굳혀 원본과 독립시킨다. */
  html: z.string(),
  /** 복제 출처 (추적용). 렌더에는 쓰지 않는다. */
  from: zNodeId.optional(),
  /** 라이브러리 도형이면 그 파일 이름. 어디서 왔는지 추적한다. */
  library: z.string().optional(),
}).strict();

/**
 * 그룹은 노드가 아니다. DOM 컨테이너를 만들지 않고 "함께 선택·이동·삭제"만 뜻한다.
 * 흐름 레이아웃 위에 컨테이너를 새로 끼우면 KG 그리드가 무너지므로 논리적 묶음으로 둔다.
 * (따라서 그룹 통째 크기 조절은 지원하지 않는다 — README 한계 항목)
 */
export const zGroup = z.object({
  members: z.array(zNodeId).min(2),
  label: z.string().default(''),
}).strict();

export const zTreeOverlay = z.object({
  /** 지워진 원본 노드의 묘비. 서브트리 전체가 함께 사라진다. */
  removed: z.array(zNodeId).default([]),
  /** 원본에 없던 노드. 항상 캔버스 절대좌표로 놓인다. */
  added: z.record(zNodeId, zAddedNode).default({}),
  /** 논리적 묶음 */
  groups: z.record(zGroupId, zGroup).default({}),
  /** 이동·삭제를 막을 노드. 상단 고정 위계(헤더·메시지띠·꼬리말)가 기본으로 들어간다. */
  locked: z.array(zNodeId).default([]),
}).strict();

export type AddedKind = z.infer<typeof zAddedKind>;
export type AddedNode = z.infer<typeof zAddedNode>;
export type Group = z.infer<typeof zGroup>;
export type TreeOverlay = z.infer<typeof zTreeOverlay>;

export const EMPTY_TREE: TreeOverlay = { removed: [], added: {}, groups: {}, locked: [] };

/**
 * 상단 고정 위계 — 임포트 시 자동으로 잠근다.
 * KG 장표의 정체성이 여기서 나오므로, 실수로 끌어 옮기거나 지우는 일을 기본적으로 막는다.
 * 사용자가 명시적으로 잠금을 풀면 편집할 수 있다.
 */
export const LOCKED_BY_DEFAULT = [
  '.kg-header',
  '.kg-msgband',
  '.kg-footer',
  '.kg-chapter-tab',
];

/**
 * 배경 — 집히지 않는다.
 *
 * 장표를 떠받치는 판이지 사람이 옮기거나 꾸미는 개체가 아니다. 게다가 화면을 거의 다 덮고 있어
 * 집히게 두면 영역 드래그를 시작할 빈 자리가 사라진다.
 *
 * **이름으로 정한다.** 예전에는 "제 모습이 없는 껍데기" 로 가렸는데, 그 판정이 글자를 품었는지
 * 부터 보는 바람에 배경색이나 테두리를 가진 멀쩡한 네모박스까지 함께 묶여 집히지 않았다
 * (한 장에 15개까지 나왔다). 배경은 몇 개뿐이고 이름이 정해져 있으므로 여기 적는 편이 정확하다.
 *
 * 상단 고정 위계는 LOCKED_BY_DEFAULT 가 이미 잠그므로 여기 겹쳐 적지 않는다.
 */
export const BACKGROUND_SELECTORS = [
  '.kg-slide',
  '.kg-body-area',
];
