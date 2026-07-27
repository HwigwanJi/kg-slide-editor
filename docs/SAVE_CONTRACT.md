# 저장계약 (Save Contract)

형식의 정의는 [`src/contract/schema.ts`](../src/contract/schema.ts) 에만 있다.
이 문서는 **왜 그렇게 생겼는지**를 설명한다. 필드 목록을 여기에 복사하지 않는다 —
스키마와 문서가 어긋나는 순간 진실이 둘이 되기 때문이다.

## 설계 전제

KG 장표는 PPT처럼 절대좌표 도형의 모음이 아니라 **CSS grid/flex 흐름 레이아웃**이다.
장표 한 장은 `<section class="kg-slide">` 하나와 장표 전용 `<style>` 한 덩어리로 되어 있고,
연결선·도넛·셰브론 같은 요소가 `::before`, `clip-path`, 인라인 SVG로 그려져 있다.

이 구조를 도형 목록으로 분해해 저장하면 원본이 손실된다.
그래서 계약은 원본을 분해하지 않고 **원본 + 덧씌운 변경분**으로 나눈다.

```
SlideDoc = source (불변 원본 HTML)  +  patches (편집분)  +  stack (쌓임 순서)
```

- `source.html` 은 임포트 시점 그대로다. 편집 결과를 여기 되쓰지 않는다.
- 편집 결과는 전부 `patches` 에만 쌓인다.
- 화면 렌더, 파일 내보내기, 저장이 모두 이 둘을 같은 방식으로 합친다. 그래서 갈라질 여지가 없다.

## 노드를 가리키는 법

패치는 요소를 **구조 경로**로 가리킨다. `n.2.1.0` 은 "루트의 3번째 자식 → 2번째 자식 → 1번째 자식"이다.
임포트할 때 `core/ids.ts` 가 원본 트리를 훑어 이 경로를 `data-kg-id` 로 찍는다.

경로는 원본에서만 계산하므로 몇 번을 다시 그려도 같은 요소는 같은 ID를 얻는다.
글자 런과 그래픽(`svg`, `img`) 안쪽으로는 내려가지 않는다 — 그 안은 편집 단위가 아니다.

## 색을 저장하는 법

색은 값이 아니라 **브랜드 토큰 참조**로 저장한다.

```json
{ "style": { "background": "token:blue-200" } }
```

렌더할 때 `var(--blue-200)` 으로 바뀐다. 이렇게 하면
장표 팔레트가 바뀌어도 저장된 문서가 따라 바뀌고, 브랜드를 벗어난 색이 섞이는 것도 막힌다.
토큰 목록은 `public/kg/colors_and_type.css` 를 실행 시점에 읽어 만든다(`contract/tokens.ts`).

## 배치를 저장하는 법

| `layout.mode` | 저장되는 값 | 뜻 |
|---|---|---|
| `flow` | `dx`, `dy` | 흐름 레이아웃 안에서 시각적으로만 옮김. 주변 요소는 그대로. |
| `detached` | `x`, `y`, `w`, `h` | 흐름에서 떼어내 캔버스 절대좌표로 고정. 자유 이동·크기 조절. |

좌표 단위는 항상 캔버스 px(1280×905)다. 화면 배율은 좌표에 섞지 않는다.
떼어낸 요소는 렌더 시 `.kg-detached-layer` 로 옮겨져 슬라이드 루트의 직계 자식이 된다.
그래서 좌표계가 캔버스와 정확히 일치한다.

쌓임 순서는 `stack` 배열 하나로 정한다. 뒤로 갈수록 위에 온다. 노드에 z 값을 따로 두지 않는다.

## 예시

```json
{
  "v": 1,
  "id": "0f3c…",
  "title": "C. 진단·검토형",
  "canvas": { "w": 1280, "h": 905 },
  "source": { "kind": "kg-html", "html": "<section class=\"kg-slide\">…</section>", "css": ".node{…}" },
  "patches": {
    "n.1.0": { "text": { "html": "단계별 <b>배제·환급</b> 설계로 보완 필요" } },
    "n.2.1.2.0.0": {
      "style": { "background": "token:blue-050", "fontSize": 16 },
      "layout": { "mode": "detached", "x": 644, "y": 263, "w": 620, "h": 132 }
    }
  },
  "stack": ["n.2.1.2.0.0"],
  "createdAt": "2026-07-27T01:20:00.000Z",
  "updatedAt": "2026-07-27T01:41:12.000Z"
}
```

## 버전 올리기

1. `src/contract/schema.ts` 에서 필드를 고치고 `CONTRACT_VERSION` 을 올린다.
2. `src/contract/migrate.ts` 의 `MIGRATIONS` 에 `이전버전 → 새버전` 순수 함수를 추가한다.
3. 검증은 이미 경계에 걸려 있으므로 따로 손댈 곳이 없다.

## 저장 위치를 바꾸려면

`src/adapters/storage.ts` 의 `StorageAdapter` 를 다시 구현하고 `createEditor(구현체)` 에 넣는다.
계약도 코어도 UI도 바뀌지 않는다. 현재 구현은 `localAdapter`(localStorage) 하나이며,
파일 왕복(`downloadDoc` / `readDocFile`)은 백업·이관용으로 따로 있다.
