/**
 * 서식 탭 — 세부 편집.
 * 선택 탭에서 무엇을 고칠지 정한 뒤, 값을 만지는 곳이다.
 * 여기서 바꾼 값은 위계 전역값을 따르지 않게 되므로 그 사실을 항상 함께 보여 준다.
 */
import type { ColorRef, KgToken, NodeId, SlideDoc, TextAlign } from '@contract/index';
import type { EditorApi } from '../editor';

const TEXT_ALIGNS: [TextAlign, string][] = [
  ['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽'], ['justify', '양쪽'],
];
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900] as const;

export function FormatTab({
  api, doc, selection, tokens, minFontSize,
}: {
  api: EditorApi;
  doc: SlideDoc;
  selection: NodeId[];
  tokens: KgToken[];
  minFontSize: number;
}) {
  const id = selection[0];
  if (!id) return <p className="ed-empty">요소를 고르면 서식을 만질 수 있습니다.</p>;

  const style = doc.patches[id]?.style;
  const overridden = style && Object.keys(style).length > 0;

  return (
    <>
      <section className="ed-section">
        <h2 className="ed-section__title">
          글자
          {overridden && <span className="ed-badge">개별 지정</span>}
        </h2>
        <p className="ed-note">여기서 바꾸면 위계 전역값을 따르지 않습니다.</p>

        <div className="ed-field">
          <span className="ed-field__label">크기</span>
          <span className="ed-field__control">
            <input
              className="ed-input ed-input--num"
              type="number" min={minFontSize} max={96}
              value={style?.fontSize ?? ''}
              placeholder="위계 기본"
              onChange={(e) => api.styleSelected({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
            />
            <span className="ed-label">px · 최소 {minFontSize}</span>
          </span>
        </div>

        <div className="ed-field">
          <span className="ed-field__label">굵기</span>
          <span className="ed-field__control">
            <select
              className="ed-select"
              value={style?.fontWeight ?? ''}
              onChange={(e) => api.styleSelected({
                fontWeight: e.target.value ? (Number(e.target.value) as (typeof WEIGHTS)[number]) : undefined,
              })}
            >
              <option value="">위계 기본</option>
              {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </span>
        </div>

        <div className="ed-field">
          <span className="ed-field__label">자간</span>
          <span className="ed-field__control">
            <input
              className="ed-input ed-input--num" type="number" step={0.005} min={-0.1} max={0.5}
              value={style?.letterSpacing ?? ''}
              placeholder="0"
              onChange={(e) => api.styleSelected({ letterSpacing: e.target.value ? Number(e.target.value) : undefined })}
            />
            <span className="ed-label">em</span>
          </span>
        </div>

        <div className="ed-field">
          <span className="ed-field__label">행간</span>
          <span className="ed-field__control">
            <input
              className="ed-input ed-input--num" type="number" step={0.05} min={0.8} max={3}
              value={style?.lineHeight ?? ''}
              placeholder="기본"
              onChange={(e) => api.styleSelected({ lineHeight: e.target.value ? Number(e.target.value) : undefined })}
            />
          </span>
        </div>

        <div className="ed-field">
          <span className="ed-field__label">문단 정렬</span>
          <span className="ed-field__control">
            {TEXT_ALIGNS.map(([a, label]) => (
              <button key={a} className="ed-btn" aria-pressed={style?.textAlign === a}
                onClick={() => api.styleSelected({ textAlign: a })}>{label}</button>
            ))}
          </span>
        </div>

        <button className="ed-btn" onClick={() => api.clearStyleSelected()}>서식 초기화</button>
      </section>

      <ColorField label="글자색" tokens={tokens} value={style?.color}
        onPick={(color) => api.styleSelected({ color })} />
      <ColorField label="배경" tokens={tokens} value={style?.background}
        onPick={(background) => api.styleSelected({ background })} />
      <ColorField label="테두리" tokens={tokens} value={style?.borderColor}
        onPick={(borderColor) => api.styleSelected({ borderColor })} />

      <section className="ed-section">
        <h2 className="ed-section__title">서식 복사</h2>
        <div className="ed-field">
          <span className="ed-field__label" />
          <span className="ed-field__control">
            <button className="ed-btn" onClick={() => api.copyFormat()}>복사</button>
            <button className="ed-btn" onClick={() => api.pasteFormat('all')}>전체</button>
            <button className="ed-btn" onClick={() => api.pasteFormat('text')}>글자만</button>
            <button className="ed-btn" onClick={() => api.pasteFormat('shape')}>도형만</button>
          </span>
        </div>
      </section>
    </>
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
