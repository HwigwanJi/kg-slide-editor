# kg-slide-editor

케인즈그룹 장표(keynes-group-design 스킬이 그린 HTML)를 불러와 세미 PPT 방식으로 고치는 편집기.

인라인 글자 편집 · 도형 이동 · 크기 조절 · 정렬 · 앞뒤 순서 · 색상 변경 · 저장 · 내보내기.

## 현재 상태

편집기와 도구가 모두 동작한다. 계약은 v4.
화면은 2단 리본 + 좌측 장표 목록 + 우측 4탭 패널(선택·서식·위계·검사) 구성이다.

모양을 손볼 때 건드릴 곳은 `src/app/*.tsx` 와 `src/styles/editor/*.css` 두 곳이다.
계약·코어·어댑터는 그대로 둔다.

## 실행

```bash
npm install
npm run build:audit   # 검사 번들
npm run build:apply   # 커맨드 적용 번들
npm run dev
```

`http://localhost:5180` 에서 좌측 레일의 샘플 장표를 눌러 시작한다.

## 도구

```bash
node tools/ingest.mjs  <프로젝트폴더>          # 장표 HTML → slides/*.kgslide + deck.json
node tools/lint.mjs    <입력>                  # 위계·글자 하한·넘침·이탈·빈 박스·문구
node tools/preview.mjs <입력> [-o 출력.png]    # 1280×905 스크린샷
node tools/apply.mjs   <slide.kgslide> --cmds  # 커맨드로 문서 고치기 (--vocab 로 목록)
```

작업 순서와 사람이 확인해야 넘어가는 지점은
`keynes-group-design` 스킬의 `WORKFLOW.md` 에 있다.

## 조작

| 동작 | 방법 |
|---|---|
| 요소 선택 | 클릭 (Shift+클릭으로 여러 개) |
| 글자 편집 | 더블클릭 → 입력 → 바깥 클릭(확정) / Esc(취소) |
| 이동 | 드래그. 흐름 유지 상태에서는 미세 이동, 떼어낸 상태에서는 자유 이동 |
| 크기 조절 | 선택 후 모서리 핸들 드래그 (흐름 요소는 이때 자동으로 떼어냄) |
| 미세 이동 | 방향키 1px, Shift+방향키 8px |
| 스냅 해제 | Alt 누른 채 드래그 |
| 정렬·순서·색상 | 툴바와 우측 패널 |

## 기술 구성

| 영역 | 선택 | 이유 |
|---|---|---|
| 번들러 | Vite | — |
| UI | React (껍데기만) | 툴바·패널 같은 폼 UI에 적합. 장표 DOM은 React가 소유하지 않는다 |
| 계약 | zod | 스키마에서 타입을 파생해 진실을 하나로 유지 |
| 글자 편집 | tiptap (인라인 전용 스키마) | 직접 만들면 수천 줄 |
| 이동·크기 | 포인터 이벤트 직접 처리 | 라이브러리를 넣어도 줄어드는 코드가 없음 |
| 상태 | 자체 스토어 90줄 | 필요한 것이 문서 하나 + 구독 + 되돌리기뿐 |
| 저장 | localStorage + JSON 파일 | `StorageAdapter` 뒤에 있어 나중에 교체 가능 |

## 구조

의존 방향은 한쪽이다: `app → adapters → core → contract`

- `src/contract` — 저장계약. [설계 배경](docs/SAVE_CONTRACT.md)
- `src/core` — 순수 로직(ID·커맨드·스토어·렌더·내보내기)
- `src/adapters` — 임포트·저장소·tiptap·포인터
- `src/app` — 배선과 화면 조각
- `src/styles` — 토큰 계층(`--ed-*`)과 화면 조각 스타일
- `public/kg` — KG 공통 CSS·폰트·로고 (keynes-group-design 스킬에서 복사)

작업 규칙은 [AGENTS.md](AGENTS.md)에 있다. 세션 시작 시 훅이 자동으로 읽어 넣는다.

## 한계

- 한 번에 장표 한 장만 다룬다. 덱(여러 장) 관리는 아직 없다.
- 원본 HTML 구조가 바뀌면 기존 패치의 노드 경로가 어긋난다. 원본을 다시 임포트하면 편집분이 초기화된다.
- `public/kg/` 는 스킬 자산의 복사본이다. 스킬이 갱신되면 다시 복사해야 한다.
