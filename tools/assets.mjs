/**
 * 프로젝트 그림 찾기 — 장표의 `assets/…` 를 실제 파일로 잇는다.
 *
 * 장표는 그림을 프로젝트 기준 상대경로로 들고 있다(계약 ASSETS_DIR). 프로젝트를 옮겨도
 * 따라오게 하려는 것이다. 그런데 검사·미리보기는 KG CSS 폴더 안에 임시 파일을 만들어 여는지라
 * (그래야 colors_and_type.css 가 상대경로로 잡힌다) 그 기준에서는 `assets/` 가 엉뚱한 곳을 가리킨다.
 *
 * 그래서 그림만 절대 file: 주소로 바꿔 준다. 원본 파일은 건드리지 않는다 —
 * 임시로 만드는 HTML 안에서만 바뀐다.
 *
 * 프로젝트를 모를 때(낱장 HTML 을 그냥 검사할 때)는 아무것도 바꾸지 않는다.
 * 그러면 예전처럼 KG 폴더의 assets/ 가 잡히므로, 스킬 샘플 장표가 그대로 돈다.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 작도 원본(`../assets/`)과 예전 적재본(`/kg/assets/`), 지금 적재본(`assets/`)을 모두 잡는다. */
const ANY_ASSET_REF = /(?:(?:\.\.\/)+|\/kg\/)?assets\//g;

/**
 * 이 입력이 속한 프로젝트 폴더. 못 찾으면 null.
 *
 *   <프로젝트>                     -> 그 폴더
 *   <프로젝트>/slides/x.kgslide    -> <프로젝트>
 *   아무 데나 있는 x.html          -> null (프로젝트가 아니다)
 */
export function projectRootOf(input) {
  const full = resolve(input);
  if (!existsSync(full)) return null;

  const hasProject = (dir) =>
    existsSync(join(dir, 'project.kgproj')) || existsSync(join(dir, 'deck.json'));

  if (hasProject(full)) return full;

  // slides/ 나 source/ 안의 파일이면 그 위가 프로젝트다.
  const parent = dirname(full);
  if (/^(slides|source)$/.test(basename(parent)) && hasProject(dirname(parent))) {
    return dirname(parent);
  }
  return hasProject(parent) ? parent : null;
}

/**
 * 장표 HTML 의 그림 경로를 실제 파일로 잇는다.
 *
 * **프로젝트에 있으면 프로젝트 것, 없으면 스킬 것.**
 * 한 장표가 두 종류를 함께 쓰기 때문이다. 케인즈 로고는 모든 장표에 들어가는 브랜드 자산이라
 * 스킬(public/kg/assets)이 주인이고, 사업별 캡처는 프로젝트가 주인이다.
 * 전부 프로젝트로 돌리면 로고가 장표마다 깨지고, 전부 스킬로 두면 사업 그림이 setup 때 사라진다.
 *
 * @param html  장표 HTML
 * @param root  프로젝트 폴더. null 이면 전부 스킬 기준으로 둔다.
 */
export function linkAssets(html, root) {
  const dir = root ? join(root, 'assets') : null;

  return html.replace(new RegExp(`${ANY_ASSET_REF.source}([^"'\\s>]*)`, 'g'), (whole, tail) => {
    // 프로젝트에 같은 이름이 있으면 그것을 쓴다. 없으면 건드리지 않는다 —
    // 그러면 KG 폴더 기준 상대경로가 되어 예전처럼 스킬 자산이 잡힌다.
    if (dir && tail && existsSync(join(dir, tail))) {
      return `${pathToFileURL(join(dir, tail)).href}`;
    }
    return `assets/${tail}`;
  });
}
