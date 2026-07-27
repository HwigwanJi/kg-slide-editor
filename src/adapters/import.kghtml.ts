/**
 * 임포트 — keynes-group-design 스킬이 그린 장표 HTML을 문서로 받는다.
 *
 * 원본은 손대지 않고 그대로 source.html 에 넣는다. 유일한 예외가 자산 경로 치환인데,
 * 이는 원본 파일 위치(slides/)와 편집기 위치가 달라 이미지가 깨지기 때문이다.
 *
 * 임포트 시점에 상단 고정 위계를 잠근다. 헤더·메시지띠·꼬리말은 KG 장표의 정체성이라
 * 실수로 끌어 옮기거나 지우면 장표 전체가 무너진다. 필요하면 사용자가 잠금을 푼다.
 */
import { LOCKED_BY_DEFAULT, createSlideDoc, type SlideDoc } from '@contract/index';
import { ID_ATTR, stampIds } from '@core/index';

export interface ImportOptions {
  origin?: string;
  assetBase?: string;
  id?: string;
  now?: string;
}

const ASSET_REF = /^(?:\.\.\/)*assets\//;

export function importKgHtml(html: string, opts: ImportOptions = {}): SlideDoc {
  const assetBase = opts.assetBase ?? '/kg/assets/';
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  const slide = parsed.querySelector<HTMLElement>('section.kg-slide');
  if (!slide) {
    throw new Error('KG 장표가 아님 — <section class="kg-slide"> 를 찾지 못했습니다.');
  }

  for (const el of slide.querySelectorAll<HTMLImageElement>('img[src]')) {
    const src = el.getAttribute('src') ?? '';
    if (ASSET_REF.test(src)) el.setAttribute('src', src.replace(ASSET_REF, assetBase));
  }
  for (const el of slide.querySelectorAll('script')) el.remove();

  // 장표 전용 <style> 만 모은다. KG 공통 CSS는 편집기가 이미 물고 있다.
  const css = [...parsed.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n').trim();

  const title =
    parsed.querySelector('title')?.textContent?.trim() ||
    slide.querySelector('.kg-section-title')?.textContent?.trim() ||
    '제목 없음';

  return createSlideDoc({
    id: opts.id ?? crypto.randomUUID(),
    title,
    now: opts.now ?? new Date().toISOString(),
    locked: lockedIds(slide),
    source: {
      kind: 'kg-html',
      html: slide.outerHTML,
      css,
      ...(opts.origin ? { origin: opts.origin } : {}),
    },
  });
}

/**
 * 잠글 노드의 id 를 미리 계산한다.
 * 사본에 ID를 찍어 조회한 뒤 버린다 — 원본 HTML에는 편집기 흔적이 남지 않는다.
 * 스탬핑이 결정적이므로 렌더할 때 같은 id 가 다시 나온다.
 */
function lockedIds(slide: HTMLElement): string[] {
  const probe = slide.cloneNode(true) as HTMLElement;
  stampIds(probe);
  const ids: string[] = [];
  for (const selector of LOCKED_BY_DEFAULT) {
    for (const el of probe.querySelectorAll(selector)) {
      const id = el.getAttribute(ID_ATTR);
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

/** 경로에서 바로 불러오기. 개발 중 fixtures 를 띄울 때 쓴다. */
export async function importKgHtmlFrom(url: string, opts: ImportOptions = {}): Promise<SlideDoc> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`장표를 읽지 못함: ${url} (${res.status})`);
  return importKgHtml(await res.text(), { origin: url, ...opts });
}
