/**
 * 블라인드 오버레이 — 사본으로 낼 때 가릴 자리.
 *
 * 제안서 한 벌을 두 가지로 낸다. 발주처에 내는 **원본** 과, 실적 소개나 외부 공유에 쓰는 **사본**.
 * 사본에서는 고객사가 준 숫자, 사람 이름, 우리 사명과 로고가 나가면 안 된다.
 * 그렇다고 장표를 두 벌 만들면 한쪽만 고쳐지는 일이 반드시 생긴다.
 *
 * 그래서 장표는 한 벌만 두고 **어디를 가릴지만 따로 적어 둔다.**
 * 편집기에서는 형광펜 자국으로 보이고, 내보낼 때 모드에 따라 나가거나 별표로 덮인다.
 *
 * 왜 patches 가 아니라 따로인가 — patches 는 "어떻게 보이는가" 다. 블라인드는 보이는 방식이
 * 아니라 **어디까지 내보내도 되는가** 라는 다른 축이다. 서식에 섞어 두면 서식을 지울 때
 * 블라인드가 함께 지워진다. 지워진 줄 모르고 사본을 내면 그때는 되돌릴 수 없다.
 *
 * 주인은 사람(편집기)이다. AI 도 칠하지만 문서를 다시 쓰는 것이 아니라 커맨드로만 얹는다
 * — 읽고, 자기 것만 더하고, 쓴다(docs/CONCURRENCY.md).
 */
import { z } from 'zod';
import { zNodeId } from './identity';

/** 가린 자리에 들어가는 글자. */
export const MASK_TEXT = '*****';

/**
 * 한 자리를 가리는 까닭.
 *
 * `by` 를 남기는 이유가 있다. AI 가 훑어 칠한 것과 사람이 손으로 칠한 것은 신뢰도가 다르다.
 * 외부 자문위원 이름처럼 "가려도 되고 안 가려도 되는" 자리는 사람이 판단해야 하는데,
 * 누가 칠했는지가 남아 있지 않으면 나중에 무엇을 다시 봐야 하는지 알 수 없다.
 */
export const zBlindMark = z.object({
  /** 무엇이라서 가리는가 — "참여인력 실명", "고객사 내부 수치" */
  reason: z.string().default(''),
  by: z.enum(['human', 'ai']).default('human'),
}).strict();

export const zBlindOverlay = z.object({
  /** 가릴 노드. 그 아래 글자가 전부 별표로 덮인다. */
  marks: z.record(zNodeId, zBlindMark).default({}),
}).strict();

export type BlindMark = z.infer<typeof zBlindMark>;
export type BlindOverlay = z.infer<typeof zBlindOverlay>;

export const EMPTY_BLIND: BlindOverlay = { marks: {} };

/**
 * 사본에서 언제나 가리는 것 — 우리 정체가 드러나는 자리.
 *
 * 칠하는 것과 달리 이건 사람이 매번 칠할 일이 아니다. 53장 모든 꼬리말에 로고가 있고
 * 사명은 아무 데나 나온다. 한 번 빠뜨리면 사본이 사본이 아니게 되므로 규칙으로 박아 둔다.
 *
 * 긴 것부터 적는다 — `케인즈` 를 먼저 지우면 `케인즈그룹` 이 `*****그룹` 이 된다.
 */
export const IDENTITY_PATTERNS = [
  '주식회사 케인즈그룹',
  '(주)케인즈그룹',
  '케인즈그룹',
  '케인즈 그룹',
  'Keynes Group',
  'KEYNES GROUP',
  'Keynes',
  'KEYNES',
  '케인즈',
] as const;

/** 로고가 들어가는 자리. 그림이라 글자 치환이 닿지 않으므로 따로 짚는다. */
export const LOGO_SELECTORS = [
  '.kg-footer__logo',
  '.kg-logo',
  'img[src*="logo"]',
  'img[alt*="Keynes" i]',
] as const;
