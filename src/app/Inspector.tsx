/**
 * 속성 패널 — 색상·타이포·표시.
 * 색상 후보는 KG 브랜드 토큰 목록에서만 온다(contract/tokens.ts). 임의 hex 입력은 두지 않는다.
 */
import type { ColorRef, KgToken, NodeId, SlideDoc, TextAlign } from '@contract/index';
import type { EditorApi } from './editor';

const TEXT_ALIGNS: TextAlign[] = ['left', 'center', 'right', 'justify'];
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900] as const;

export function Inspector({
  api, doc, selection, tokens,
}: {
  api: EditorApi;
  doc: SlideDoc;
  selection: NodeId[];
  tokens: KgToken[];
}) {
  const id = selection[0];
  const patch = id ? doc.patches[id] : undefined;
  const detached = patch?.layout?.mode === 'detached';

  if (!id) {
    return (
      <aside className="ed-panel" data-area="panel">
        <p className="ed-empty">장표에서 요소를 클릭하면 속성이 나옵니다. 글자는 더블클릭으로 편집합니다.</p>
      </aside>
    );
  }

  return (
    <aside className="ed-panel" data-area="panel">
      <section className="ed-section">
        <h2 className="ed-section__title">선택</h2>
        <div className="ed-field">
          <span className="ed-field__label">노드</span>
          <span className="ed-field__control">{selection.join(', ')}</span>
        </div>
        <div className="ed-field">
          <span className="ed-field__label">배치</span>
          <span className="ed-field__control">{detached ? '떼어냄(절대좌표)' : '흐름 유지'}</span>
        </div>
      </section>

      <ColorField label="글자색" tokens={tokens} value={patch?.style?.color}
        onPick={(color) => api.styleSelected({ color })} />
      <ColorField label="배경" tokens={tokens} value={patch?.style?.background}
        onPick={(background) => api.styleSelected({ background })} />
      <ColorField label="테두리" tokens={tokens} value={patch?.style?.borderColor}
        onPick={(borderColor) => api.styleSelected({ borderColor })} />

      <section className="ed-section">
        <h2 className="ed-section__title">타이포</h2>
        <div className="ed-field">
          <span className="ed-field__label">크기</span>
          <span className="ed-field__control">
            <input
              className="ed-input ed-input--num"
              type="number" min={8} max={96}
              value={patch?.style?.fontSize ?? ''}
              placeholder="기본"
              onChange={(e) => api.styleSelected({
                fontSize: e.target.value ? Number(e.target.value) : undefined,
              })}
            />
            <span className="ed-label">px</span>
          </span>
        </div>
        <div className="ed-field">
          <span className="ed-field__label">굵기</span>
          <span className="ed-field__control">
            <select
              className="ed-select"
              value={patch?.style?.fontWeight ?? ''}
              onChange={(e) => api.styleSelected({
                fontWeight: e.target.value ? (Number(e.target.value) as (typeof WEIGHTS)[number]) : undefined,
              })}
            >
              <option value="">기본</option>
              {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </span>
        </div>
        <div className="ed-field">
          <span className="ed-field__label">문단 정렬</span>
          <span className="ed-field__control">
            {TEXT_ALIGNS.map((a) => (
              <button
                key={a}
                className="ed-btn"
                aria-pressed={patch?.style?.textAlign === a}
                onClick={() => api.styleSelected({ textAlign: a })}
              >{a}</button>
            ))}
          </span>
        </div>
      </section>

      <section className="ed-section">
        <h2 className="ed-section__title">표시</h2>
        <div className="ed-field">
          <span className="ed-field__label">숨김</span>
          <span className="ed-field__control">
            <input
              type="checkbox"
              checked={patch?.hidden ?? false}
              onChange={(e) => api.hideSelected(e.target.checked)}
            />
          </span>
        </div>
      </section>
    </aside>
  );
}

function ColorField({
  label, tokens, value, onPick,
}: {
  label: string;
  tokens: KgToken[];
  value?: ColorRef;
  onPick(ref: ColorRef): void;
}) {
  return (
    <section className="ed-section">
      <h2 className="ed-section__title">{label}</h2>
      <div className="ed-swatches">
        {tokens.map((t) => (
          <button
            key={t.name}
            className="ed-swatch"
            title={`${t.name} · ${t.value}`}
            aria-pressed={value === t.ref}
            style={{ ['--ed-swatch-color' as string]: t.value }}
            onClick={() => onPick(t.ref)}
          />
        ))}
      </div>
    </section>
  );
}
