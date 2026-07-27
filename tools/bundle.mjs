/**
 * 번들 준비 — 도구들이 쓰는 편집기 코어를 최신 상태로 맞춘다.
 *
 * 검사·미리보기·적재·적용은 모두 `src/` 를 번들해 브라우저나 노드에서 돌린다.
 * 규칙을 도구 쪽에 다시 구현하지 않기 위한 구조인데, 번들이 낡으면 그 목적이 무너진다 —
 * 화면은 새 규칙으로 그리는데 검사는 옛 규칙으로 판정하고, 그 어긋남은 결과를 봐도 알 수 없다.
 *
 * 그래서 존재만 보지 않고 `src/` 보다 오래됐는지까지 본다. 낡았으면 말하고 다시 만든다.
 * 저장소를 새로 받은 사람도, git pull 한 사람도 같은 명령 하나로 최신 번들을 갖게 된다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** 가장 최근에 손댄 파일의 시각. 폴더 하나를 통째로 훑는다. */
function newest(dir) {
  let latest = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const t = e.isDirectory() ? newest(p) : statSync(p).mtimeMs;
    if (t > latest) latest = t;
  }
  return latest;
}

/**
 * 번들이 최신인지 확인하고, 아니면 만든다.
 *
 * @param {'audit'|'apply'} kind
 * @returns {string} 번들 경로
 */
export function ensureBundle(kind) {
  const file = join(ROOT, 'tools', 'gen', kind === 'audit' ? 'audit.iife.js' : 'apply-bundle.js');
  const why = !existsSync(file)
    ? '번들이 없어'
    : statSync(file).mtimeMs < newest(join(ROOT, 'src'))
      ? '편집기 코어가 번들보다 새로워'
      : null;

  if (why) {
    console.error(`${why} 다시 만듭니다 (npm run build:${kind})`);
    // Windows 의 npm 은 배치 파일이라 셸을 거치지 않으면 실행되지 않는다.
    execFileSync(NPM, ['run', `build:${kind}`], { cwd: ROOT, stdio: 'inherit', shell: true });
  }
  return file;
}
