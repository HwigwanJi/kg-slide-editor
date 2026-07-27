/**
 * 블라인드 — 칠한 자리를 화면에서는 형광펜으로, 사본에서는 별표로.
 *
 * 두 모습이 한 곳에 있어야 한다. 화면에서 노랗게 보이는 자리와 사본에서 가려지는 자리가
 * 서로 다른 코드로 정해지면, 화면으로 확인하고 낸 사본에서 안 가려진 곳이 나온다.
 * 그래서 어느 노드가 대상인지는 blindTargets() 한 곳만 답한다.
 *
 * 마스킹은 **상자를 남기고 글자만 덮는다.** 통째로 지우면 격자가 무너져 옆 칸까지 흐트러지고,
 * 무엇이 가려졌는지도 안 보인다. 관공서 문서에서 검게 칠하는 것과 같은 뜻이다.
 */
import type { SlideDoc } from '@contract/index';
import { IDENTITY_PATTERNS, LOGO_SELECTORS, MASK_TEXT } from '@contract/index';
import { ID_ATTR, SLOT_CLASS, TEXT_ATTR, byId } from './ids';
import { isRemoved } from './tree';

/** 편집뷰에서 형광펜 자국을 나타내는 표시. CSS 는 편집기 것만 가지고 있다. */
export const BLIND_ATTR = 'data-kg-blind';

/**
 * 지금 문서에서 실제로 가려질 노드.
 * 지워진 노드는 애초에 그려지지 않으므로 뺀다 — 세어 봐야 사람만 헷갈린다.
 */
export function blindTargets(doc: SlideDoc): string[] {
  return Object.keys(doc.blind?.marks ?? {}).filter((id) => !isRemoved(doc, id));
}

/** 편집뷰 표시. 글자는 건드리지 않는다 — 사람은 원문을 보면서 칠해야 한다. */
export function markBlind(root: HTMLElement, doc: SlideDoc): void {
  for (const id of blindTargets(doc)) byId(root, id)?.setAttribute(BLIND_ATTR, '');
}

/**
 * 사본용 마스킹. 셋을 한다.
 *   1. 칠한 자리      — 그 아래 글자를 전부 별표로
 *   2. 사명           — 어디에 있든 별표로
 *   3. 로고           — 그림을 지우고 같은 크기의 빈 자리로
 *
 * 순서가 중요하다. 사명을 먼저 지우면 칠한 자리 안의 사명이 이미 별표라 두 번 덮이는데,
 * 그건 해가 없다. 반대로 로고를 마지막에 두는 이유는 로고를 지운 뒤에도 그 자리의
 * alt 글자가 남아 사명 치환에 걸려야 하기 때문이다.
 */
export function maskForCopy(root: HTMLElement, doc: SlideDoc): void {
  for (const id of blindTargets(doc)) {
    const el = byId(root, id);
    if (el) blankOut(el);
  }
  maskIdentity(root);
  maskLogos(root);
}

/**
 * 한 덩어리를 덮는다.
 *
 * 안에 글자 런이 여럿이면 각각을 별표로 바꾼다. 통째로 별표 하나로 만들면
 * 표의 칸이 무너져 옆 열까지 밀린다 — 가린 자리가 어디였는지도 알 수 없게 된다.
 *
 * 글자가 없는 것(그림·도형)은 덮을 글자가 없으므로 자리 자체를 가린다.
 */
function blankOut(el: HTMLElement): void {
  const runs = [
    ...(el.hasAttribute(TEXT_ATTR) ? [el] : []),
    ...el.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`),
  ];

  if (runs.length === 0) {
    coverBox(el);
    return;
  }
  for (const run of runs) run.textContent = MASK_TEXT;
}

/** 그림·도형처럼 덮을 글자가 없는 것. 같은 크기의 회색 판으로 바꾼다. */
function coverBox(el: HTMLElement): void {
  el.textContent = MASK_TEXT;
  el.style.color = '#6B7280';
  el.style.background = 'repeating-linear-gradient(135deg,#E1E4E9 0 6px,#F7F8FA 6px 12px)';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.letterSpacing = '2px';
}

/**
 * 사명 치환 — 글자 마디만 훑는다.
 *
 * innerHTML 을 문자열로 바꾸면 클래스 이름이나 속성값에 든 같은 글자까지 갈려
 * CSS 선택자가 끊긴다. 그래서 DOM 의 텍스트 노드만 지나간다.
 */
export function maskIdentity(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (IDENTITY_PATTERNS.some((p) => t.data.includes(p))) hits.push(t);
  }
  for (const t of hits) {
    let s = t.data;
    for (const p of IDENTITY_PATTERNS) s = s.split(p).join(MASK_TEXT);
    t.data = s;
  }
  // 그림 설명에도 사명이 남는다. 화면에 안 보이지만 파일에는 남으므로 함께 지운다.
  for (const img of root.querySelectorAll<HTMLImageElement>('img[alt]')) {
    if (IDENTITY_PATTERNS.some((p) => img.alt.includes(p))) img.alt = MASK_TEXT;
  }
}

/** 로고 자리. 그림을 지우되 자리는 남긴다 — 빼 버리면 꼬리말 정렬이 틀어진다. */
export function maskLogos(root: HTMLElement): void {
  const seen = new Set<Element>();
  for (const sel of LOGO_SELECTORS) {
    for (const el of root.querySelectorAll<HTMLElement>(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      el.replaceChildren(document.createTextNode(MASK_TEXT));
      el.style.color = '#9AA3AF';
      el.style.fontSize = '12px';
      el.style.letterSpacing = '2px';
      // 잰 크기가 있으면 그대로 붙잡는다. 그림이 빠지면서 줄어드는 것을 막는다.
      if (r.width > 0) el.style.minWidth = `${Math.round(r.width)}px`;
      if (r.height > 0) el.style.minHeight = `${Math.round(r.height)}px`;
    }
  }
}

/* ------------------------------------------------------------------ */

export interface BlindItem {
  id: string;
  preview: string;
  reason: string;
  by: 'human' | 'ai';
}

/**
 * 블라인드 후보 — 가릴 만한 것을 찾아 사람 앞에 늘어놓는다.
 *
 * **자동으로 칠하지 않는다.** 무엇을 가릴지는 사업 판단이다. 외부 자문위원 이름은
 * 어떤 자리에서는 실적의 근거고 어떤 자리에서는 개인정보다. 기계가 정할 일이 아니다.
 * 여기서는 "이런 것들이 있다" 까지만 하고, 칠하는 것은 사람이 고른 뒤 커맨드로 들어온다.
 *
 * 놓치는 쪽보다 시끄러운 쪽이 낫다 — 못 본 것은 그대로 나가지만, 잘못 짚은 것은 사람이 뺀다.
 */
export type BlindKind = 'column' | 'person' | 'contact' | 'idnum' | 'identity';

export interface BlindCandidate {
  id: string;
  kind: BlindKind;
  /** 왜 걸렸는지 — 걸린 대목 그대로 */
  hit: string;
  preview: string;
  /** 이미 칠해져 있는가. 다시 물어볼 필요가 없다. */
  already: boolean;
}

/**
 * 한국 성씨. 이름 판정을 좁히는 데 쓴다.
 *
 * 성씨를 안 보면 `전문위원`·`외부인력` 같은 보통명사가 전부 이름으로 걸린다.
 * 실제로 성씨 없이 "두 글자 + 직함" 으로 잡아 보니 한 장에서 스무 건 넘게 나왔다.
 */
const SURNAME = '김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민류나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국은편용';

/**
 * 직함. 이름 뒤에 오면 사람으로 본다.
 *
 * **보통명사로도 쓰이는 말은 뺐다.** 위원·수석·책임·선임·고문·자문·대표를 넣었더니
 * `지표 책임자`, `유사기관 대표성`, `외부 자문위원` 이 전부 사람으로 걸렸다.
 * 긴 것을 앞에 둔다 — `본부장` 보다 `부장` 이 먼저 오면 `본` 이 성씨로 잘린다.
 */
const TITLE = '(대표이사|이사장|본부장|센터장|위원장|컨설턴트|연구원|회계사|변호사|노무사|박사|교수|소장|원장|처장|국장|실장|팀장|부장|차장|과장|사장|전무|상무)';

/**
 * 이름 + 직함.
 *
 * 이름은 **정확히 세 글자** 로 본다. 두 글자까지 허용했더니 `지정 (컨설턴트` 의 `지정`,
 * `유지 · 강화` 의 `유지` 처럼 보통명사가 이름 자리에 들어왔다. 한국 사람 이름은
 * 대부분 세 글자이고, 두 글자 이름은 직함 없이 명단 표에 있는 편이라 아래 열 규칙이 잡는다.
 *
 * 사이에 반드시 구분자가 있어야 한다. 붙여 쓰면 `전문위원`(전 + 문위원)이 걸린다.
 */
const PERSON_TITLED = new RegExp(`(?<![가-힣])[${SURNAME}][가-힣]{2}[\\s(·,/]+${TITLE}`, 'g');

/**
 * 가릴 만한 열의 머리말.
 *
 * 사람 이름을 낱개로 알아보려는 시도는 번번이 빗나간다 — `구분`·`유형`·`조직문화` 가
 * 전부 이름처럼 생겼기 때문이다. 그런데 명단은 언제나 **열** 로 되어 있고 그 열에는
 * 머리말이 붙는다. 머리말을 찾아 그 아래 칸을 통째로 짚는 편이 훨씬 정확하고,
 * 사람이 판단하기에도 낫다 — "성명 열 16칸을 가릴까요" 는 답할 수 있는 질문이다.
 */
const COLUMN_HEADERS = [
  '성명', '이름', '연락처',
  '발주처', '고객사', '기관명', '수행기관', '참여기관', '소속',
];

/*
 * `담당자`·`직위`·`직급` 은 뺐다.
 * 절차 그림에서도 흔히 쓰는 말이라 표가 아닌 곳에서 걸린다 — 실제로 산출물 관리체계
 * 장표에서 "담당자" 아래의 업무 설명 12칸이 통째로 후보가 됐다. 진짜 명단에는 성명 열이
 * 함께 있으므로 그쪽으로 잡힌다.
 */

/** 머리말인가. `소속 · 자격` 처럼 뒤에 말이 붙은 것도 같은 열로 본다. */
function headerWord(text: string): string | null {
  for (const w of COLUMN_HEADERS) {
    if (text === w) return w;
    if (text.startsWith(w) && /^[\s·/(]/.test(text.slice(w.length))) return w;
  }
  return null;
}

const CONTACT = [
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/g, what: '이메일' },
  { re: /\b0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}\b/g, what: '전화번호' },
];
const IDNUM = [
  { re: /\b\d{6}-[1-4]\d{6}\b/g, what: '주민등록번호' },
  { re: /\b\d{3}-\d{2}-\d{5}\b/g, what: '사업자등록번호' },
];

/**
 * 그려 놓은 장표를 훑는다.
 *
 * **그린 것을 받는다.** 원본 HTML 만 읽으면 사람이 편집기에서 고쳐 넣은 이름이 보이지 않는데,
 * 그건 가장 놓치면 안 되는 종류다. 그리는 일은 부르는 쪽이 한다 — render 가 이 파일을
 * 이미 부르고 있어서(마스킹) 여기서 되부르면 서로 물린다.
 */
export function scanBlindCandidates(root: HTMLElement, doc: SlideDoc): BlindCandidate[] {
  const marks = doc.blind?.marks ?? {};
  const covered = (id: string) =>
    id in marks || Object.keys(marks).some((up) => id.startsWith(`${up}.`));

  const out: BlindCandidate[] = [];
  const push = (el: HTMLElement, kind: BlindKind, hit: string) => {
    const id = el.getAttribute(ID_ATTR);
    if (!id) return;
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    out.push({
      id, kind, hit,
      preview: text.length > 40 ? `${text.slice(0, 40)}…` : text,
      already: covered(id),
    });
  };

  const runs = [...root.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`)]
    .filter((el) => !el.closest(`.${SLOT_CLASS}`));

  for (const el of runs) {
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (!text) continue;

    for (const { re, what } of CONTACT) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) push(el, 'contact', `${what} ${m[0]}`);
    }
    for (const { re, what } of IDNUM) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) push(el, 'idnum', `${what} ${m[0]}`);
    }
    PERSON_TITLED.lastIndex = 0;
    const person = [...new Set([...text.matchAll(PERSON_TITLED)].map((m) => m[0].trim()))];
    if (person.length) push(el, 'person', person.join(' · '));

    if (IDENTITY_PATTERNS.some((p) => text.includes(p))) push(el, 'identity', '사명');
  }

  for (const found of findColumns(runs)) {
    for (const el of found.cells) push(el, 'column', `${found.header} 열`);
  }

  return out;
}

/**
 * 민감한 열을 찾는다 — 자리로 찾는다.
 *
 * KG 장표는 `<table>` 이 아니라 CSS 격자다. 그래서 열이 마크업으로 묶여 있지 않고,
 * 부모·자식을 훑어서는 어느 칸이 같은 열인지 알 수 없다. 대신 **화면에서 잰 자리**로 본다 —
 * 머리말 아래에, 머리말과 가로로 겹치는 칸이면 같은 열이다. 사람이 보는 기준과 같다.
 */
function findColumns(runs: HTMLElement[]): { header: string; cells: HTMLElement[] }[] {
  const boxes = runs.map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter((b) => b.r.width > 0 && b.r.height > 0);

  const out: { header: string; cells: HTMLElement[] }[] = [];
  for (const head of boxes) {
    const word = headerWord((head.el.textContent ?? '').trim());
    if (!word) continue;

    const mid = head.r.left + head.r.width / 2;
    const under = boxes.filter((b) => b.el !== head.el
      // 머리말 아래에 있고
      && b.r.top >= head.r.bottom - 2
      // 머리말의 가로 범위와 가운데가 겹친다
      && b.r.left <= mid && mid <= b.r.right);

    /*
     * 같은 깊이만 남긴다.
     *
     * 표의 한 열은 행마다 똑같은 자리에 있으므로 구조 경로의 길이가 모두 같다.
     * 절차 그림처럼 표가 아닌 것은 아래 칸들의 깊이가 제각각인데, 그걸 걸러 내지 않으면
     * 머리말 하나가 그 아래 덩어리 전체를 후보로 만든다.
     */
    const depthOf = (el: HTMLElement) => (el.getAttribute(ID_ATTR) ?? '').split('.').length;
    const tally = new Map<number, number>();
    for (const b of under) tally.set(depthOf(b.el), (tally.get(depthOf(b.el)) ?? 0) + 1);
    const [modal] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];

    const found = under
      .filter((b) => depthOf(b.el) === modal)
      .sort((a, b) => a.r.top - b.r.top)
      .map((b) => b.el);

    // 두 칸짜리는 표라고 보기 어렵다. 우연히 세로로 늘어선 글자일 수 있다.
    if (found.length >= 3) out.push({ header: word, cells: found });
  }
  return out;
}

/** 칠해진 자리를 사람이 훑어볼 수 있게 문서 순서대로 편다. */
export function listBlind(root: HTMLElement, doc: SlideDoc): BlindItem[] {
  const marks = doc.blind?.marks ?? {};
  const out: BlindItem[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)) {
    if (el.closest(`.${SLOT_CLASS}`)) continue;
    const id = el.getAttribute(ID_ATTR);
    const mark = id ? marks[id] : undefined;
    if (!id || !mark) continue;
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    out.push({
      id,
      preview: text.length > 36 ? `${text.slice(0, 36)}…` : (text || '(글자 없음)'),
      reason: mark.reason,
      by: mark.by,
    });
  }
  return out;
}
