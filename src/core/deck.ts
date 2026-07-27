/**
 * 덱 커맨드 — 프로젝트의 순서와 목차를 바꾸는 유일한 통로.
 *
 * 장표 커맨드와 같은 규칙을 따른다: 순수 함수, 마지막에 불변식 강제.
 * 장표 내용은 여기서 다루지 않는다. 목차 한 줄(제목·시각·미리보기)까지가 전부다.
 */
import { DECK_VERSION, type DeckDoc, type DeckEntry } from '@contract/index';
import { createStore, type Store } from './store';

export type DeckCommand =
  | { type: 'setName'; name: string }
  | { type: 'addSlide'; entry: DeckEntry; at?: number }
  | { type: 'removeSlides'; ids: string[] }
  | { type: 'moveSlide'; id: string; to: number }
  | { type: 'reorder'; ids: string[] }
  /** 장표를 저장했을 때 목차 한 줄을 맞춘다. */
  | { type: 'touchSlide'; id: string; title: string; updatedAt: string }
  | { type: 'setPreview'; id: string; preview: string | null };

export type DeckStore = Store<DeckDoc, DeckCommand>;

export function createDeckStore(deck: DeckDoc, now: () => string = () => new Date().toISOString()): DeckStore {
  return createStore(deck, applyDeck, (d) => ({ ...d, updatedAt: now() }));
}

export function applyDeck(deck: DeckDoc, cmd: DeckCommand): DeckDoc {
  return normalizeDeck(reduce(deck, cmd));
}

function reduce(deck: DeckDoc, cmd: DeckCommand): DeckDoc {
  switch (cmd.type) {
    case 'setName':
      return { ...deck, name: cmd.name };

    case 'addSlide': {
      const slides = deck.slides.filter((s) => s.id !== cmd.entry.id);
      const at = cmd.at ?? slides.length;
      slides.splice(Math.max(0, Math.min(at, slides.length)), 0, cmd.entry);
      return { ...deck, slides };
    }

    case 'removeSlides':
      return { ...deck, slides: deck.slides.filter((s) => !cmd.ids.includes(s.id)) };

    case 'moveSlide': {
      const from = deck.slides.findIndex((s) => s.id === cmd.id);
      if (from < 0) return deck;
      const slides = [...deck.slides];
      const [entry] = slides.splice(from, 1);
      slides.splice(Math.max(0, Math.min(cmd.to, slides.length)), 0, entry!);
      return { ...deck, slides };
    }

    case 'reorder': {
      const known = new Map(deck.slides.map((s) => [s.id, s]));
      const ordered = cmd.ids.map((id) => known.get(id)).filter((s): s is DeckEntry => !!s);
      // 목록에 없던 장표는 잃지 않고 뒤에 붙인다.
      const rest = deck.slides.filter((s) => !cmd.ids.includes(s.id));
      return { ...deck, slides: [...ordered, ...rest] };
    }

    case 'touchSlide':
      return {
        ...deck,
        slides: deck.slides.map((s) =>
          s.id === cmd.id ? { ...s, title: cmd.title, updatedAt: cmd.updatedAt } : s),
      };

    case 'setPreview':
      return {
        ...deck,
        slides: deck.slides.map((s) => {
          if (s.id !== cmd.id) return s;
          if (cmd.preview === null) {
            const { preview: _drop, ...rest } = s;
            return rest;
          }
          return { ...s, preview: cmd.preview };
        }),
      };
  }
}

/** 불변식 — 목차에 같은 장표가 두 번 들어가지 않는다. */
function normalizeDeck(deck: DeckDoc): DeckDoc {
  const seen = new Set<string>();
  const slides = deck.slides.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  return { ...deck, v: DECK_VERSION, slides };
}

/** 목차에서 장표의 자리(1부터). 없으면 0. */
export function slideNumber(deck: DeckDoc, id: string): number {
  return deck.slides.findIndex((s) => s.id === id) + 1;
}

/**
 * 새로 적재하는 장표가 들어갈 자리.
 *
 * 적재에서는 파일 이름이 곧 순서다. 여러 대에서 나눠 그린 장표를 한곳에 모을 때
 * 이 규칙 하나로만 순서가 정해지므로, 새 장표를 무조건 뒤에 붙이면
 * 나중에 받은 10번이 20번 뒤에 놓인다.
 *
 * 다만 이미 있는 목차를 다시 정렬하지는 않는다. 사람이 편집기에서 손으로 바꾼 순서가
 * 적재할 때마다 되돌아가면 안 되기 때문이다. 이름이 앞서는 첫 자리에만 끼워 넣는다.
 */
export function placeByOrigin(slides: DeckEntry[], origin: string): number | undefined {
  const at = slides.findIndex((s) => s.origin && s.origin.localeCompare(origin, 'ko') > 0);
  return at < 0 ? undefined : at;
}
