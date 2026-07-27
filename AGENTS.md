# 작업 규칙 — kg-slide-editor

케인즈그룹 장표(KG HTML)를 불러와 세미 PPT 방식으로 고치는 편집기.
UI/UX는 나중에 만든다. **지금 저장소가 지키는 것은 저장계약 · 모듈 경계 · 토큰 계층 세 가지다.**

이 파일이 규칙의 유일한 진실이다. `CLAUDE.md` 는 여기를 가리키기만 한다.
세션이 시작될 때 `.claude/hooks/load-context.mjs` 가 이 파일을 자동으로 읽어 넣는다.
규칙을 바꿀 때는 대화가 아니라 이 파일을 고친다.

---

## 1. 절대 규칙

### R1. 저장계약은 `src/contract/schema.ts` 한 곳에서만 정의한다
- 타입은 zod 스키마에서 `z.infer` 로 파생한다. `interface SlideDoc` 을 손으로 또 쓰지 않는다.
- 문서·주석·README 는 스키마를 **설명**만 한다. 필드 목록을 복사해 두지 않는다.
- 형식을 바꾸면 `CONTRACT_VERSION` 을 올리고 `src/contract/migrate.ts` 에 이관 규칙을 넣는다.
- 검증은 경계에서만 한다: 저장소·파일에서 읽은 직후, 저장·내보내기 직전. 내부 커맨드 경로에서 재검증하지 않는다.

### R2. 문서 상태는 `patches` 한 곳에만 쌓인다
- `source.html` 은 불변이다. 편집 결과를 원본 HTML에 되쓰지 않는다.
- 렌더 · 내보내기 · 저장이 전부 같은 `patches` 를 읽는다. 화면과 파일이 갈라질 여지를 만들지 않는다.
- z-order의 진실은 `stack` 배열 하나다. 노드에 z 값을 따로 두지 않는다.

### R3. 문서를 바꾸는 통로는 `src/core/commands.ts` 뿐이다
- `apply(doc, cmd)` 는 순수 함수다. DOM · 시간 · 난수에 의존하지 않는다.
- 어떤 UI 파일도 `doc.patches[...] = ...` 를 직접 쓰지 않는다. 커맨드를 만든다.
- 실행취소는 커맨드 역산이 아니라 문서 스냅샷으로 처리한다(`src/core/store.ts`).

### R4. 렌더는 부분 갱신하지 않는다
- `render(mount, doc)` 는 캔버스를 통째로 다시 만든다. DOM에 상태가 남으면 진실이 둘이 된다.
- 드래그 중에는 커맨드를 보내지 않는다. 인라인 스타일로 미리보기만 하고, 손을 뗄 때 한 번 보낸다.
- 텍스트 편집 세션이 열려 있는 동안에는 그 요소를 다시 그리지 않는다.

### R5. 스타일은 토큰만 쓴다
- 편집기 UI 토큰은 `--ed-` 접두사. 장표 브랜드 토큰(`--navy-800` 등)은 `public/kg/colors_and_type.css` 소유.
  **두 계층을 절대 섞지 않는다.**
- `src/styles/editor/*.css` 에는 리터럴 색상(`#hex`, `rgb()`)과 생 px 를 쓰지 않는다. `var(--ed-*)` 만 쓴다.
- 원시 팔레트(`--ed-c-*`)는 `tokens/color.css` 안에서만 참조한다. 컴포넌트는 의미 토큰까지만 안다.
- 저장계약에 색을 넣을 때는 `token:navy-800` 형태를 쓴다. hex 하드코딩은 예외 경로다.
- 색상 후보 목록은 KG CSS를 실행 시점에 읽어서 만든다(`src/contract/tokens.ts`). TS에 팔레트를 복사하지 않는다.

### R6. 배선 파일에는 로직을 넣지 않는다
- `src/app/App.tsx` — 조각 배치와 값 전달만. 편집 규칙 · 좌표 계산 · DOM 조작 · 스타일 값 금지.
- `src/styles/index.css` — `@import` 순서만. 선택자 규칙 금지.
- `src/app/editor.ts` — 코어와 DOM을 잇는 배선층. 새 편집 규칙은 여기가 아니라 `core/commands.ts` 에 넣는다.
- 툴바·패널은 `editor.ts` 가 노출한 동작 이름만 부른다. 스토어를 직접 만지지 않는다.

### R7. React는 장표 DOM을 소유하지 않는다
- 캔버스 안쪽은 `core/render.ts` 가 만든다. React는 빈 상자 두 개(`.ed-stage`, `.ed-paper`)만 만들고 물러난다.
- React는 `useSyncExternalStore` 로 스토어를 구독만 한다. 문서를 state 로 복제하지 않는다.
- 캔버스는 스토어 변경에 **동기로** 반응한다. React 렌더 주기를 타면 드래그가 한 프레임씩 밀린다.

### R8. 모든 기능은 화면에 노출된다
- 커맨드를 `core/commands.ts` 에 추가하면 `app/actions.ts` 에도 반드시 등록한다.
  등록하지 않으면 사람이 쓸 수 없는 기능이 생긴다.
- 툴바·우클릭 메뉴·버블 툴바·단축키·명령 목록(Ctrl+K)은 전부 `ACTIONS` 배열 하나에서 파생된다.
  버튼 목록이나 키 조합을 화면 파일에 직접 적지 않는다.
- 단축키는 오피스 관습을 그대로 쓴다(Ctrl+Z/Y/S/C/V/X/D/G/A, Delete, F2, Ctrl+[ ]).
  새로 배우게 하는 조합을 만들지 않는다.
- 액션의 `covers` 에 커맨드 타입을 적으면 세션 훅이 누락을 잡아 준다.

### R9. 값은 세 층으로 흐른다 — 위계 · 전역 · 개별
- KG 원본(`colors_and_type.css`) < 문서 전역(`theme`) < 노드 개별(`patches.style`).
- 전역은 CSS 규칙으로, 개별은 인라인 스타일로 걸린다. 우선순위는 캐스케이드가 처리한다.
  코드에서 "누가 이기는지"를 계산하지 않는다.
- 그래서 전역을 조정하면 개별로 손대지 않은 요소만 따라 바뀐다.
  "시스템 초기값으로 복구"는 개별을 지우는 것(`clearStyle`), "전역 초기화"는 `resetTheme` 다.
- 우리 코드에 KG 기본 수치를 복사해 두지 않는다. 바꾸지 않은 위계는 규칙 자체를 만들지 않는다.

### R10. 레이아웃은 흔들리지 않는다
클릭·선택·편집만으로 장표가 움직이면 안 된다. 아래 장치를 무너뜨리는 변경을 넣지 않는다.
- 떼어낼 때 원래 자리에 같은 크기의 빈 자리(`.kg-slot`)를 남긴다.
- 미세 이동은 `transform` 으로만 한다. `margin`·`top` 을 건드리지 않는다.
- 선택 표시는 캔버스 바깥 오버레이가 그린다. 장표 안 요소에 `border`·`padding` 을 더하지 않는다(`outline` 만).
- 인라인 요소를 편집할 때 편집기 div 는 `display:inline` 으로 흐른다.
- 상단 고정 위계(헤더·메시지띠·꼬리말·챕터탭)는 임포트 시 잠근다.

### R11. 코드를 늘리기 전에 먼저 묻는다 (ponytail)
1. 이게 꼭 있어야 하나? 아니면 안 만든다.
2. 이미 저장소에 있나? 있으면 다시 쓰지 말고 그걸 쓴다.
3. 라이브러리로 줄어드는 코드가 실제로 있나? 없으면 넣지 않는다.
   - 드래그: 포인터 이벤트 60줄로 끝난다 → 라이브러리 없음.
   - 상태관리: 스토어 90줄로 끝난다 → 라이브러리 없음.
   - 리치텍스트: 직접 만들면 수천 줄이다 → tiptap 사용.
   - 스키마+타입: 손으로 둘 다 쓰면 진실이 둘이 된다 → zod 사용.

---

## 2. 디렉터리 지도

```
src/
  contract/          저장계약. 다른 모든 것이 여기에 의존한다. 여기는 아무것도 의존하지 않는다.
    identity.ts      식별자 규칙(원본 n.2.1 / 추가 a<8자> / 그룹 g<8자>)
    style.ts         모양 오버레이 — StylePatch·LayoutPatch·NodePatch
    tree.ts          ★ 존재·구조 오버레이 — 삭제 묘비·추가·그룹·잠금
    typography.ts    위계(role)와 문서 전역 테마
    schema.ts        ★ SlideDoc 합성 + 계약 버전
    deck.ts          ★ DeckDoc — 순서·목차만. 장표 내용을 담지 않는다
    validate.ts      경계 검증 / migrate.ts 버전 이관 / tokens.ts KG 토큰 레지스트리
  core/              순수 로직. DOM은 쓰되 React·tiptap은 모른다.
    ids.ts           안정 노드 ID·위계 스탬핑, 텍스트 런 판정
    sanitize.ts      인라인 텍스트 정제(허용 태그 외 제거)
    tree.ts          ★ 구조 불변식 강제(normalize) — 모든 커맨드가 여기를 통과
    commands.ts      ★ 장표 커맨드 — 장표를 바꾸는 유일한 통로
    deck.ts          ★ 덱 커맨드 — 순서를 바꾸는 유일한 통로
    store.ts         문서 + 이력 + 구독 (장표·덱이 같은 구현을 쓴다)
    theme.ts         위계 전역값 → CSS
    render.ts        문서 → 캔버스 DOM (전체 재생성, 빈 자리 유지)
    overflow.ts      넘침 감사 / format.ts 서식 읽기 / serialize.ts 독립 HTML
  adapters/          바깥 세계와 붙는 지점. 갈아끼울 수 있어야 한다.
    import.kghtml.ts KG 장표 HTML → 문서
    project.ts       ★ ProjectAdapter 인터페이스 + 브라우저 저장소
    project.folder.ts  실제 폴더(File System Access) — 실제 작업 방식
    storage.ts       파일 내려받기·읽어들이기
    clipboard.ts     개체·서식 클립보드 / snippets.kg.ts 삽입 마크업
    text.tiptap.ts   인라인 텍스트 편집(인라인 전용 스키마)
    transform.pointer.ts  선택·이동·리사이즈(포인터 이벤트)
  app/               배선. 로직 없음.
    editor.ts        코어·어댑터·DOM 연결, 공개 동작 목록(EditorApi)
    actions.ts       ★ 액션 레지스트리 — 모든 노출면이 여기서 파생
    shortcuts.ts     레지스트리 → 키 처리
    App.tsx          ★ 조각 배치만
    hooks.ts         React ↔ 스토어 다리
    SlideCanvas / Toolbar / Inspector / ThemePanel / DeckRail / StatusBar / menus
  styles/
    index.css        ★ @import 순서만
    tokens/          palette → color/type/space/shape/motion/layer
    base.css         리셋 + 앱 그리드 골격
    editor/          화면 조각별 규칙(전부 var(--ed-*) 참조)
public/
  kg/                KG 공통 CSS·폰트·로고 (스킬에서 복사)
  fixtures/          개발용 샘플 장표
```

프로젝트 폴더 구조(사용자 쪽) — 계약이 정하고 `project.folder.ts` 가 따른다.

```
프로젝트/
  deck.json          순서·제목·메타만
  slides/*.kgslide   장표 한 장 = 파일 하나
  preview/*.png      장표별 미리보기
  library/*.svg      도형 라이브러리
```

의존 방향은 한쪽이다: `app → adapters → core → contract`. 역방향 import 금지.

---

## 3. 편집 모델 (하이브리드)

| 상태 | 뜻 | 이동 | 크기 | 표시 |
|---|---|---|---|---|
| `flow` | KG 흐름 레이아웃 유지 | `nudge` 로 시각적 오프셋만(주변 재배치 없음) | 불가 | 점선 선택 박스 |
| `detached` | 흐름에서 떼어내 캔버스 절대좌표 | `setRect` 로 자유 이동 | 8방향 핸들 | 실선 선택 박스 |

- 핸들을 잡으면 `flow` 요소는 그 순간 자동으로 `detach` 된다.
- 떼어낸 요소는 `.kg-detached-layer` 로 옮겨 슬라이드 루트의 직계 자식이 된다. 그래서 좌표계가 캔버스와 같다.
- 좌표 단위는 항상 캔버스 px(1280×905). 화면 배율은 좌표에 섞지 않는다.
- 격자 스냅 4px. Alt 를 누르면 해제.

---

## 4. 하지 말 것

- 장표 안쪽 요소에 `--ed-*` 토큰을 쓰는 것 (브랜드 토큰을 쓴다)
- 편집기 UI에 KG 브랜드 토큰을 쓰는 것 (`--ed-*` 를 쓴다)
- `App.tsx` 나 컴포넌트에서 `store.dispatch` 로 커맨드를 직접 조립하는 것 (`editor.ts` 동작을 부른다)
- 텍스트 패치에 `<div>`·`<span>`·속성이 들어가게 두는 것 (`sanitizeInline` 이 걷어낸다. 허용 태그를 늘릴 때는
  `core/ids.ts` 의 `FORMAT_TAGS` 와 `adapters/text.tiptap.ts` 의 확장 목록을 **같이** 고친다)
- 스키마와 별도로 검증 함수를 손으로 쓰는 것
- 드래그 중 커맨드 발행 (이력이 수백 칸으로 늘어난다)
- `public/kg/` 안의 KG CSS를 고치는 것 (원본은 keynes-group-design 스킬이 소유한다. 필요하면 스킬을 고치고 다시 복사)

---

## 5. 작업 절차

```bash
npm run dev        # 개발 서버 (http://localhost:5180)
npm run typecheck  # 타입 검사
npm run build      # 타입 검사 + 번들
```

바꾼 뒤 최소 확인:
1. `npm run typecheck` 통과
2. 샘플 장표를 불러와 **글자 더블클릭 편집 → 드래그 → 떼어내기 → 저장 → 다시 불러오기** 가 왕복되는지
3. 내보낸 HTML에 `data-kg-*` 속성이 남지 않는지

---

## 6. 문체 (사용자 대상 문자열)

한국 공공기관 보고서 문체를 따른다. 명사형 종결, 이모지·픽토그램 없음, 마케팅·IT 유행어 없음.
UI 라벨과 오류 메시지도 같은 기준을 적용한다.
