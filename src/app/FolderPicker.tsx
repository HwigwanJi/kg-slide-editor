/**
 * 폴더 고르기 창.
 *
 * 브라우저 폴더 선택창을 쓰지 않는다. 그것은 권한 모델을 함께 데려오기 때문이다
 * (project.localapi.ts 머리말). 대신 dev 서버가 폴더 목록을 주고 여기서 걸어 들어간다.
 *
 * **이 파일은 컴포넌트 하나만 내보낸다.** 보통 함수를 섞으면 Fast Refresh 가 꺼져
 * 모듈이 통째로 무효화된다(folder.request.ts 머리말). 약속과 최근 목록은 그쪽에 있다.
 */
import { useCallback, useEffect, useState } from 'react';
import { DECK_FILE, DECK_FILE_LEGACY } from '@contract/index';
import { listDir, listRoots, type DirEntry } from '@adapters/index';
import { answerFolder, forgetRecent, readRecent, registerFolderPicker } from './folder.request';

/** 한 화면에 그리는 최대 줄 수. 폴더가 수천 개인 자리에서 창이 굳지 않게 한다. */
const MAX_ROWS = 300;

const isProjectFile = (name: string): boolean => name === DECK_FILE || name === DECK_FILE_LEGACY;

const isProject = (items: DirEntry[]): boolean =>
  items.some((i) => i.kind === 'file' && isProjectFile(i.name));

export function FolderPicker() {
  const [shown, setShown] = useState(false);
  const [here, setHere] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [rows, setRows] = useState<DirEntry[]>([]);
  const [cut, setCut] = useState(0);
  const [hereIsProject, setHereIsProject] = useState(false);
  const [roots, setRoots] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [why, setWhy] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => registerFolderPicker(setShown), []);

  const go = useCallback(async (path: string): Promise<boolean> => {
    setLoading(true);
    setWhy('');
    try {
      const listing = await listDir(path);
      // 폴더와 프로젝트 파일만 보인다. 나머지 파일은 고르는 데 방해만 된다.
      // 프로젝트 파일을 보여 주는 이유는 사람이 그것을 눌러 열기 때문이다.
      const keep = listing.items.filter((i) => (
        i.kind === 'dir' ? !i.name.startsWith('.') : isProjectFile(i.name)
      ));
      setHere(listing.path);
      setParent(listing.parent);
      setRows(keep.slice(0, MAX_ROWS));
      setCut(Math.max(0, keep.length - MAX_ROWS));
      setHereIsProject(isProject(listing.items));
      return true;
    } catch (e) {
      setWhy(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!shown) return;
    void (async () => {
      const found = await listRoots().catch(() => []);
      setRoots(found);

      // 지난번 폴더부터 시도한다. 사라졌으면 목록에서 빼고 드라이브로 물러난다 —
      // 없는 곳을 보여 준 채로 멈추면 여기서 아무 데도 갈 수 없다.
      const past = readRecent();
      for (const path of past) {
        if (await go(path)) { setRecent(readRecent()); return; }
        forgetRecent(path);
      }
      setRecent(readRecent());
      if (found[0]) await go(found[0]);
    })();
  }, [shown, go]);

  const close = useCallback((path: string | null) => {
    setShown(false);
    answerFolder(path);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, close]);

  if (!shown) return null;

  return (
    <div className="ed-blocker" role="dialog" aria-modal="true" aria-label="프로젝트 폴더 고르기">
      <div className="ed-picker">
        <div className="ed-picker__head">
          <span className="ed-picker__title">프로젝트 폴더</span>
          <span className="ed-picker__path" title={here}>{here || '—'}</span>
        </div>

        {recent.length > 0 && (
          <div className="ed-picker__recent">
            <span className="ed-picker__label">최근</span>
            {recent.map((p) => (
              <button key={p} type="button" className="ed-picker__chip" onClick={() => void go(p)} title={p}>
                {p.split(/[\\/]/).filter(Boolean).pop()}
              </button>
            ))}
          </div>
        )}

        <div className="ed-picker__roots">
          {roots.map((r) => (
            <button key={r} type="button" className="ed-picker__chip" onClick={() => void go(r)}>{r}</button>
          ))}
          <button
            type="button" className="ed-picker__chip" disabled={!parent}
            onClick={() => { if (parent) void go(parent); }}
          >
            상위로
          </button>
        </div>

        <ul className="ed-picker__list">
          {loading && <li className="ed-picker__empty">읽는 중…</li>}
          {!loading && why && <li className="ed-picker__empty" data-bad="true">{why}</li>}
          {!loading && !why && rows.length === 0 && <li className="ed-picker__empty">하위 폴더가 없습니다</li>}
          {!loading && !why && rows.map((d) => (
            <li key={d.name}>
              {/*
                프로젝트 파일을 누르면 그 파일이 있는 폴더를 연다. 여는 단위는 폴더다 —
                .kgproj 는 목차일 뿐이고 slides/ 와 preview/ 가 옆에 있어야 뜻이 생긴다(D1).
                다만 사람은 "프로젝트 파일을 연다" 고 생각하므로 그 감각대로 눌리게 둔다.
              */}
              <button
                type="button" className="ed-picker__row" data-kind={d.kind}
                onClick={() => (d.kind === 'dir' ? void go(`${here}/${d.name}`) : close(here))}
              >
                {d.name}
              </button>
            </li>
          ))}
          {cut > 0 && <li className="ed-picker__empty">… 외 {cut}개는 줄여 두었습니다</li>}
        </ul>

        <div className="ed-picker__foot">
          <span className="ed-picker__note">
            {hereIsProject ? '이 폴더에 프로젝트가 있습니다 — 열면 이어서 작업합니다' : '프로젝트가 없는 폴더입니다 — 새로 만듭니다'}
          </span>
          <span className="ed-picker__grow" />
          <button type="button" className="ed-picker__btn" onClick={() => close(null)}>취소</button>
          <button
            type="button" className="ed-picker__btn" data-primary="true"
            disabled={!here} onClick={() => close(here)}
          >
            이 폴더 열기
          </button>
        </div>
      </div>
    </div>
  );
}
