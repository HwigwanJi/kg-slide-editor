/**
 * 선택 요소 미리보기 — 장표를 복제해 선택 부분만 확대해 보여 준다.
 *
 * 캔버스 배율이 60% 안팎이라 작은 요소는 화면에서 형태가 보이지 않는다.
 * 무엇을 고르고 있는지 확인할 곳이 필요하다.
 *
 * 확대·축소는 고정점(앵커)을 먼저 고르고 배율을 준다. 어느 모서리를 붙박느냐에 따라
 * 결과가 완전히 달라지므로, 그 선택을 사람이 먼저 하게 한다.
 */
import { useEffect, useRef } from 'react';
import { ANCHOR_ORIGIN, type Anchor, type NodeId } from '@contract/index';
import type { EditorApi } from '../editor';

const ANCHORS: Anchor[] = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
const STEPS: [number, string][] = [[0.9, '−10%'], [0.95, '−5%'], [1.05, '+5%'], [1.1, '+10%']];
const VIEW = { w: 232, h: 132, pad: 24 };

export function ObjectThumb({
  api, selection, anchor, onAnchor, detached,
}: {
  api: EditorApi;
  selection: NodeId[];
  anchor: Anchor;
  onAnchor(a: Anchor): void;
  detached: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    box.replaceChildren();

    const id = selection[0];
    const slide = document.querySelector<HTMLElement>('.ed-paper .kg-slide');
    const live = id ? slide?.querySelector<HTMLElement>(`[data-kg-id="${CSS.escape(id)}"]`) : null;
    if (!id || !slide || !live) return;

    // 위치는 살아 있는 요소에서 잰다. 복제본은 배치되기 전이라 크기를 알 수 없다.
    const b = slide.getBoundingClientRect();
    const r = live.getBoundingClientRect();
    const scale = parseFloat(getComputedStyle(slide.parentElement!).getPropertyValue('--ed-scale')) || 1;
    const rect = {
      x: (r.left - b.left) / scale, y: (r.top - b.top) / scale,
      w: r.width / scale, h: r.height / scale,
    };

    const k = Math.min(
      VIEW.w / (rect.w + VIEW.pad * 2),
      VIEW.h / (rect.h + VIEW.pad * 2),
      4,
    );

    const stage = document.createElement('div');
    stage.className = 'ed-thumb__stage';
    stage.style.transform =
      `scale(${k}) translate(${-rect.x + (VIEW.w / k - rect.w) / 2}px, ${-rect.y + (VIEW.h / k - rect.h) / 2}px)`;
    stage.appendChild(slide.cloneNode(true));

    const marker = document.createElement('div');
    marker.className = 'ed-thumb__mark';
    marker.style.cssText =
      `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;` +
      `outline-width:${Math.max(1, 1.5 / k)}px;`;
    stage.appendChild(marker);

    box.appendChild(stage);
  }, [selection]);

  return (
    <section className="ed-section">
      <h2 className="ed-section__title">선택 미리보기</h2>
      <div className="ed-thumb" ref={host} />

      <div className="ed-field">
        <span className="ed-field__label">고정점</span>
        <span className="ed-field__control">
          <div className="ed-anchors" role="group" aria-label="확대 고정점">
            {ANCHORS.map((a) => (
              <button
                key={a}
                className="ed-anchor"
                aria-pressed={anchor === a}
                title={`${ANCHOR_ORIGIN[a][0] * 100}% / ${ANCHOR_ORIGIN[a][1] * 100}%`}
                onClick={() => onAnchor(a)}
              />
            ))}
          </div>
        </span>
      </div>

      <div className="ed-field">
        <span className="ed-field__label">크기</span>
        <span className="ed-field__control">
          {STEPS.map(([factor, label]) => (
            <button
              key={label}
              className="ed-btn"
              disabled={!detached}
              title={detached ? undefined : '먼저 떼어내야 크기를 조절할 수 있습니다'}
              onClick={() => api.scaleSelected(factor, anchor)}
            >{label}</button>
          ))}
        </span>
      </div>
      {!detached && <p className="ed-note">흐름 안에 있는 요소는 KG 레이아웃이 크기를 정합니다. 떼어내면 조절할 수 있습니다.</p>}
    </section>
  );
}
