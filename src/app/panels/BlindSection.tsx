/**
 * 블라인드 — 사본으로 낼 때 가릴 자리를 형광펜으로 칠한다.
 *
 * 검사 탭에 둔 이유: 이건 "잘 보이는가" 가 아니라 "내보내도 되는가" 를 확인하는 일이고,
 * 넘침 검사와 마찬가지로 **내기 전에 한 번 훑는** 성격이다. 서식 탭에 두면 꾸미는 일로 읽힌다.
 *
 * 화면에서는 늘 원문이 보인다. 가려진 모습은 사본으로 내보낸 파일에서만 나온다 —
 * 칠하는 동안 글자가 별표로 바뀌면 무엇을 칠하고 있는지 알 수 없기 때문이다.
 */
import { useEffect, useState } from 'react';
import type { SlideDoc } from '@contract/index';
import type { BlindItem } from '@core/index';
import type { EditorApi } from '../editor';

export function BlindSection({ api, doc, selection }: {
  api: EditorApi;
  doc: SlideDoc;
  selection: string[];
}) {
  const [items, setItems] = useState<BlindItem[]>([]);
  const [painting, setPainting] = useState(api.blindPaint());
  const [copy, setCopy] = useState(api.copyMode());

  // 목록은 화면에 그려진 것을 읽어 만든다. 문서가 바뀔 때마다 다시 센다.
  useEffect(() => { setItems(api.blindList()); }, [api, doc]);
  useEffect(() => api.onCopyMode(setCopy), [api]);

  const paint = (on: boolean) => { api.setBlindPaint(on); setPainting(on); };

  return (
    <>
      <section className="ed-section">
        <h2 className="ed-section__title">내보내기 모드</h2>
        <div className="ed-field">
          <span className="ed-field__label">모드</span>
          <span className="ed-field__control">
            <button className="ed-btn" aria-pressed={!copy} onClick={() => api.setCopyMode(false)}>원본</button>
            <button className="ed-btn" aria-pressed={copy} onClick={() => api.setCopyMode(true)}>사본</button>
          </span>
        </div>
        <p className="ed-note" data-tone={copy ? 'warn' : undefined}>
          {copy
            ? '사본 — 칠한 자리와 사명·로고가 *****로 덮여 나갑니다.'
            : '원본 — 칠한 자리까지 전부 그대로 나갑니다.'}
        </p>
      </section>

      <section className="ed-section">
        <h2 className="ed-section__title">
          블라인드
          {items.length > 0 && <span className="ed-tab__badge">{items.length}</span>}
        </h2>

        <div className="ed-field">
          <span className="ed-field__label">형광펜</span>
          <span className="ed-field__control">
            <button className="ed-btn" aria-pressed={painting} onClick={() => paint(!painting)}>
              {painting ? '칠하는 중 — 끄기' : '칠하기'}
            </button>
            <button
              className="ed-btn"
              disabled={selection.length === 0}
              title="고른 것을 가립니다. 그림처럼 붓으로 집기 어려운 것에 씁니다"
              onClick={() => api.blindSelected(true)}
            >고른 것 가리기</button>
          </span>
        </div>

        {painting && (
          <p className="ed-note">
            끌어서 칠합니다. 이미 칠해진 자리에서 끌기 시작하면 그 획은 지웁니다.
            칠하는 동안에는 개체를 고르거나 옮길 수 없습니다.
          </p>
        )}

        {items.length === 0 && <p className="ed-note">이 장표에 가린 곳이 없습니다.</p>}

        {items.map((it) => (
          <div className="ed-issue" key={it.id}>
            <span className="ed-issue__kind" data-kind={it.by === 'ai' ? 'sparse' : 'clipped'}>
              {it.by === 'ai' ? 'AI 제안' : '가림'}
            </span>
            <span className="ed-issue__text">{it.preview}</span>
            <span className="ed-issue__meta">{it.reason}</span>
            <button
              className="ed-btn"
              onClick={() => { api.select([it.id]); api.blindSelected(false); }}
            >풀기</button>
          </div>
        ))}

        {items.length > 0 && (
          <div className="ed-field">
            <span className="ed-field__label" />
            <span className="ed-field__control">
              <button className="ed-btn" onClick={() => api.clearBlind()}>이 장표 전체 풀기</button>
            </span>
          </div>
        )}
      </section>
    </>
  );
}
