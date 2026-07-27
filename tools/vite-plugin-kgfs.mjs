/**
 * 로컬 파일 다리 — 편집기가 실제 폴더를 브라우저 권한 없이 읽고 쓴다.
 *
 * File System Access API 는 브라우저가 주인이라 우리가 못 고치는 제약이 넷 있다.
 * Chromium 계열 전용, 바탕화면·다운로드 상위·시스템 폴더는 사용자가 허용해도 막힘,
 * 새로고침하면 권한이 "물어봄" 으로 되돌아감, 권한 요청은 클릭 직후에만 통함.
 * 그래서 project.folder.ts 는 절반이 권한과 싸우는 코드다(진단 도구까지 따로 있다).
 *
 * 여기서는 dev 서버가 node 로 파일을 만진다. 위 넷이 전부 성립하지 않는다.
 *
 * 뒷날 Electron 으로 옮길 때 갈아 끼우는 것은 이 파일 하나다.
 * 어댑터(project.localapi.ts)가 부르는 연산 목록이 그대로 IPC 채널 목록이 된다.
 *
 *   GET  /__kgfs/list?path=  폴더 안 목록 (name·kind·mtime)
 *   GET  /__kgfs/read?path=  파일 하나 (본문 그대로)
 *   GET  /__kgfs/stat?path=  수정 시각만 (내용을 읽지 않는다)
 *   POST /__kgfs/write       { path, text } 또는 본문이 바이너리
 *   POST /__kgfs/remove      { path }
 *   GET  /__kgfs/roots       드라이브 목록 (탐색기 시작점)
 *
 * 경로는 제한하지 않는다 — 프로젝트 폴더가 어디에 있을지 정할 수 없기 때문이다.
 * 대신 남의 페이지가 이 서버를 부리는 것은 막는다. 아래 guard 주석 참고.
 */
import { constants, existsSync } from 'node:fs';
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';

const PREFIX = '/__kgfs/';

/**
 * 남의 페이지가 이 서버를 부리지 못하게 막는다.
 *
 * dev 서버는 localhost 에만 붙지만, 사용자가 아무 웹페이지나 열어 둔 채로 작업한다.
 * 그 페이지가 fetch('http://localhost:5180/__kgfs/write') 를 부르면 브라우저는 순순히 보낸다
 * — 단순 요청(GET, 또는 text/plain POST)에는 사전 확인이 없기 때문이다.
 *
 * 그래서 표준 헤더가 아닌 것을 하나 요구한다. 이것이 붙으면 브라우저는 반드시 사전 확인을
 * 먼저 보내고, 우리는 거기에 답하지 않으므로 본 요청이 아예 오지 않는다.
 * 우리 편집기는 같은 출처라 사전 확인 자체가 없다.
 */
function allowed(req) {
  if (req.headers['x-kg-fs'] !== '1') return false;
  const origin = req.headers.origin;
  // 같은 출처면 브라우저가 Origin 을 붙이지 않거나 자기 자신을 붙인다.
  if (!origin) return true;
  return origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

const send = (res, code, body, type = 'application/json') => {
  res.statusCode = code;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
};

const ok = (res, data) => send(res, 200, JSON.stringify(data));

/** 실패는 까닭을 그대로 넘긴다. 부르는 쪽이 사람에게 보여 줄 문장을 만든다. */
const fail = (res, code, why) => send(res, code, JSON.stringify({ error: why }));

function readBody(req) {
  return new Promise((done, blow) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', blow);
  });
}

/** 윈도우 드라이브 목록. 탐색기의 시작점이다. */
async function drives() {
  if (process.platform !== 'win32') return ['/'];
  const found = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`;
    try {
      await access(root, constants.R_OK);
      found.push(root);
    } catch { /* 없는 드라이브는 건너뛴다 */ }
  }
  return found;
}

export function kgfs() {
  return {
    name: 'kg-fs',
    // dev 서버에만 붙는다. 빌드 산출물에는 들어가지 않는다.
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(PREFIX)) return next();
        if (!allowed(req)) return fail(res, 403, '이 서버는 편집기에서만 부를 수 있습니다.');

        try {
          // 주소 해석도 안에 둔다. 여기서 던지면 async 미들웨어가 거부된 약속을 남기고,
          // 그것을 받아 주는 곳이 없어 node 가 프로세스째 내려간다 — 편집기가 통째로 멈춘다.
          const parsed = new URL(url, 'http://x');
          const op = parsed.pathname.slice(PREFIX.length);
          const at = parsed.searchParams.get('path');

          if (op === 'roots') return ok(res, { roots: await drives() });

          /*
           * 열 것이 없을 때 열 만한 것.
           *
           * 빈 편집기는 무엇을 할 수 있는 도구인지 알려 주지 못한다. 설치가 projects/ 에
           * 펼쳐 둔 것을 알려 주어, 받은 사람이 첫 화면에서 실물을 보게 한다.
           * 브라우저는 저장소가 어디 있는지 모르므로 여기서 답한다.
           */
          if (op === 'starters') {
            const work = join(process.cwd(), 'projects');
            const found = [];
            try {
              for (const e of await readdir(work, { withFileTypes: true })) {
                if (!e.isDirectory()) continue;
                const at = join(work, e.name);
                const has = ['project.kgproj', 'deck.json']
                  .some((f) => existsSync(join(at, f)));
                if (has) found.push(at);
              }
            } catch { /* projects/ 가 아직 없으면 빈 목록이다 */ }
            return ok(res, { starters: found });
          }

          if (op === 'list') {
            if (!at) return fail(res, 400, 'path 가 없습니다.');
            const dir = resolve(at);
            // 이름과 종류만 준다. 파일마다 stat 을 부르면 System32 처럼 수천 개인 폴더에서
            // 순차 호출이 1초를 넘긴다. 수정 시각이 필요한 쪽은 stat 을 따로 부른다.
            const items = (await readdir(dir, { withFileTypes: true }))
              .map((e) => ({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file' }));
            return ok(res, { path: dir, parent: dirname(dir) === dir ? null : dirname(dir), items });
          }

          if (op === 'read') {
            if (!at) return fail(res, 400, 'path 가 없습니다.');
            const buf = await readFile(resolve(at));
            return send(res, 200, buf, 'application/octet-stream');
          }

          if (op === 'stat') {
            if (!at) return fail(res, 400, 'path 가 없습니다.');
            try {
              const s = await stat(resolve(at));
              return ok(res, { exists: true, mtime: s.mtimeMs, dir: s.isDirectory() });
            } catch {
              // 없는 것은 잘못이 아니다. 부르는 쪽이 "파일 없음" 으로 다룬다.
              return ok(res, { exists: false, mtime: 0, dir: false });
            }
          }

          if (req.method !== 'POST') return fail(res, 405, `${op} 은 POST 로 부릅니다.`);
          const body = await readBody(req);

          if (op === 'write') {
            const { path: p, text, base64 } = JSON.parse(body.toString('utf8'));
            if (!p) return fail(res, 400, 'path 가 없습니다.');
            const full = resolve(p);
            // 하위 폴더가 없으면 만든다. 저장 한 번에 slides/ preview/ 가 함께 생긴다.
            await mkdir(dirname(full), { recursive: true });
            await writeFile(full, base64 != null ? Buffer.from(base64, 'base64') : String(text ?? ''), base64 != null ? undefined : 'utf8');
            return ok(res, { path: full });
          }

          /*
           * 내보내기 — 브라우저가 못 하는 일이라 여기서 한다.
           *
           * PNG·PDF 는 실제 크로미움으로 찍어야 KG 의 그라데이션·clip-path·웹폰트가 살아난다.
           * 그 일을 하는 도구가 이미 있으므로(tools/export.mjs) 여기서는 부르기만 한다 —
           * 화면에서 내보낸 것과 명령줄에서 내보낸 것이 갈리면 안 된다.
           */
          if (op === 'export') {
            const { root, png, pdf, pptx, mask } = JSON.parse(body.toString('utf8'));
            if (!root) return fail(res, 400, 'root 가 없습니다.');
            const { exportDeck } = await import('./export.mjs');
            // mask 를 빠뜨리면 화면에서 사본을 골라도 원본이 나간다. 조용히 틀리는 종류라 적어 둔다.
            const r = await exportDeck(resolve(root), { png, pdf, pptx, mask });
            return ok(res, r);
          }

          if (op === 'remove') {
            const { path: p } = JSON.parse(body.toString('utf8'));
            if (!p) return fail(res, 400, 'path 가 없습니다.');
            await rm(resolve(p), { recursive: true, force: true });
            return ok(res, { path: resolve(p) });
          }

          return fail(res, 404, `모르는 연산 — ${op}`);
        } catch (e) {
          return fail(res, 500, e?.message ?? String(e));
        }
      });
    },
  };
}

/** 경로를 사람이 읽는 이름으로. 어댑터가 프로젝트 이름을 만들 때 쓴다. */
export const baseName = (p) => parse(p).base || p;
