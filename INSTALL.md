# 새 컴퓨터에 설치하기

여러 대에서 나눠 작도하려면 모든 컴퓨터가 같은 스킬·같은 CSS·같은 규칙을 써야 한다.
한 대라도 다르면 나중에 합칠 때 글꼴과 간격이 어긋난다.

## 한 줄

```bash
git clone https://github.com/HwigwanJi/kg-slide-editor.git && cd kg-slide-editor && node tools/setup.mjs --all
```

이것으로 끝난다. `--all` 이 하는 일은 아래 전부다.

| 무엇 | 어디로 |
|---|---|
| 의존성 | `node_modules/` |
| 미리보기 브라우저 (Playwright) | 시스템 |
| 스킬 (`keynes-group-design` · `AI-Polish`) | `~/.claude/skills/` |
| 워크플로우 훅 | `~/.claude/hooks/` + `settings.json` 에 등록 |
| 편집기 자산 (CSS·글꼴·로고) | `public/kg/` |
| 도구 번들 (검사·적용) | `tools/gen/` |
| **시작 프로젝트** | `samples/` → `projects/` |

몇 번을 돌려도 결과가 같다. 이미 받은 것은 건너뛰고, `projects/` 에 이미 있는 프로젝트는 건드리지 않는다.

이어서 편집기를 띄운다.

```bash
npm run dev
```

`http://localhost:5180` — **열면 시작 프로젝트가 이미 들어 있다.** 빈 화면이 아니라 실물로 시작한다.

## 알아 둘 것

**`projects/` 는 작업본이다.** 원본은 `samples/` 에 있고 git 이 그쪽만 담는다.
작업본을 아무리 고쳐도 원본은 그대로이고, `npm run setup` 을 다시 돌려도 작업본을 덮지 않는다.
처음부터 다시 보고 싶으면 `projects/` 의 그 폴더를 지우고 설치를 다시 돌린다.

**개발 서버를 내리고 설치한다.** 서버가 떠 있으면 윈도우가 `public/kg` 안의 파일을 잡고 있어
자산을 갈아 끼울 수 없다. 그 경우 설치가 **아무것도 지우지 않고** 멈추며 그 사실을 알린다.

**스킬을 고칠 곳은 이 저장소의 `skills/` 다.** `~/.claude/skills` 는 거기서 만들어 낸다.
설치본을 직접 고쳐 두었으면 설치가 멈추고 어느 파일인지 알려 준다.

## 설치가 됐는지 확인

```bash
npm run build
```

```bash
npm run lint:slides -- public/fixtures
```

빌드는 통과해야 하고, 검사는 샘플 장표의 지적을 몇 건 뱉으면 정상이다(종료 코드 1).

## 최신으로 맞추기

저장소가 갱신되면 **[SYNC.md](SYNC.md) 의 지시문을 클로드 코드에 붙여 넣는다.**
코드만이 아니라 스킬과 작업 규칙까지 바뀌므로 `git pull` 만으로는 절반만 갱신된다.

```bash
git pull --rebase && npm run setup
```

`npm run setup` 을 잊어도 검사·미리보기·적재는 편집기 코어가 번들보다 새로우면 알아서 다시 만든다.
다만 스킬과 편집기 자산은 `npm run setup` 을 돌려야 갱신된다.

## 여러 대에서 나눠 그리고 합치기

**나누기** — 쪽 번호 범위로 가른다. 파일 이름 앞의 번호가 곧 덱 순서이므로 범위가 겹치지 않으면 충돌하지 않는다.

```
가 컴퓨터   source/01_*.html ~ source/20_*.html
나 컴퓨터   source/21_*.html ~ source/40_*.html
```

**합치기** — 각 컴퓨터의 `source/*.html` 을 한 프로젝트의 `source/` 에 모은 뒤 적재한다.

```bash
npm run ingest -- <프로젝트폴더>
```

편집기에서는 리본의 **적재** 단추로 같은 일을 한다. 여러 개를 한 번에 고를 수 있다.

이미 넣은 장표와 파일 이름이 같으면 자리와 쪽번호를 지킨 채 내용만 갈아 끼운다.
**그 장표에 편집기로 한 수정은 사라진다.** 편집기는 갈아 끼우기 전에 묻고, 명령줄 도구는 묻지 않는다.

**주의** — 슬라이드 파일(`slides/*.kgslide`)을 여러 대에서 동시에 고치면 나중에 저장한 쪽이 이긴다.
한 장표는 한 사람만 맡는다. 장표를 나눠 맡으면 부딪히는 것은 `project.kgproj` 하나뿐이다.
