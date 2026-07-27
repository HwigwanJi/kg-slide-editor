# 새 컴퓨터에 설치하기

여러 대에서 나눠 작도하려면 모든 컴퓨터가 같은 스킬·같은 CSS·같은 규칙을 써야 한다.
한 대라도 다르면 나중에 합칠 때 글꼴과 간격이 어긋난다.

## 1. 저장소 받기

```
gh repo clone HwigwanJi/kg-slide-editor
```

## 2. 아래를 클로드 코드에 그대로 붙여 넣는다

---

이 저장소는 케인즈그룹 장표 작업 도구다. 방금 받았으니 설치해라.

1. 저장소 폴더에서 차례로 실행한다.

   ```
   npm install
   npm run setup
   npx playwright install chromium
   ```

   `npm run setup` 이 하는 일: `skills/` 를 `~/.claude/skills/` 로, `hooks/` 를 `~/.claude/hooks/` 로
   복사하고, `~/.claude/settings.json` 에 워크플로우 훅을 등록하고, `skills/keynes-group-design` 에서
   편집기 자산을 `public/kg/` 로 만들고, 도구가 쓰는 번들을 만든다. 몇 번을 돌려도 결과가 같다.

   `~/.claude/skills` 를 직접 고쳐 둔 것이 있으면 설치가 멈추고 어느 파일인지 알린다.
   고칠 곳은 저장소의 `skills/` 다 — 그쪽이 원본이고 `~/.claude/skills` 는 거기서 만들어 낸다.

2. 설치가 됐는지 확인한다. 둘 다 통과해야 한다.

   ```
   npm run build
   npm run lint:slides -- public/fixtures
   ```

3. 설치 중 "없는 경로를 부릅니다" 경고가 나오면 그 내용을 사람에게 알린다. 임의로 고치지 마라.

4. 작업 규칙은 `AGENTS.md`, 장표 워크플로우는 `~/.claude/skills/keynes-group-design/WORKFLOW.md` 에 있다.
   설치를 마쳤으면 이 두 개를 읽고, 무엇을 할지 물어라.

---

## 3. 최신으로 맞추기

저장소가 갱신되면 **[SYNC.md](SYNC.md) 의 지시문을 클로드 코드에 붙여 넣는다.**
코드만이 아니라 스킬과 작업 규칙까지 바뀌므로 `git pull` 만으로는 절반만 갱신된다.

```
git pull --rebase
npm install
npm run setup
```

`npm run setup` 을 잊어도 검사·미리보기·적재는 편집기 코어가 번들보다 새로우면 알아서 다시 만든다.
다만 스킬과 편집기 자산은 `npm run setup` 을 돌려야 갱신된다.

## 4. 여러 대에서 나눠 그리고 합치기

**나누기** — 쪽 번호 범위로 가른다. 파일 이름 앞의 번호가 곧 덱 순서이므로 범위가 겹치지 않으면 충돌하지 않는다.

```
가 컴퓨터   source/01_*.html ~ source/20_*.html
나 컴퓨터   source/21_*.html ~ source/40_*.html
```

**합치기** — 각 컴퓨터의 `source/*.html` 을 한 프로젝트의 `source/` 에 모은 뒤 적재한다.

```
npm run ingest -- <프로젝트폴더>
```

편집기에서는 리본의 **적재** 단추로 같은 일을 한다. 여러 개를 한 번에 고를 수 있다.

이미 넣은 장표와 파일 이름이 같으면 자리와 쪽번호를 지킨 채 내용만 갈아 끼운다.
**그 장표에 편집기로 한 수정은 사라진다.** 편집기는 갈아 끼우기 전에 묻고, 명령줄 도구는 묻지 않는다.

**주의** — 슬라이드 파일(`slides/*.kgslide`)을 여러 대에서 동시에 고치면 나중에 저장한 쪽이 이긴다.
한 장표는 한 사람만 맡는다. 장표를 나눠 맡으면 부딪히는 것은 `deck.json` 하나뿐이다.
