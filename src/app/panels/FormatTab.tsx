/**
 * 서식 탭 — 세부 편집.
 * 선택 탭에서 무엇을 고칠지 정한 뒤, 값을 만지는 곳이다.
 * 개별 지정은 항목 단위다. 크기를 바꿔도 색·굵기·정렬은 계속 위계를 따른다.
 * 그래서 어느 항목이 개별값인지 표시하고, 되돌리기도 항목 단위로 둔다.
 */
import type { ColorRef, KgToken, NodeId, SlideDoc, StylePatch, TextAlign } from '@contract/index';
import type { EditorApi } from '../editor';

const TEXT_ALIGNS: [TextAlign, string][] = [
  ['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽'], ['justify', '양쪽'],
];
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900] as const;

export function FormatTab({
  api, doc, selection, tokens, minFontSize, shapeVars,
}: {
  api: EditorApi;
  doc: SlideDoc;
  selection: NodeId[];
  tokens: KgToken[];
  minFontSize: number;
  /** 선택한 도형이 쓰는 CSS 변수 */
  shapeVars: string[];
}) {
  const id = selection[0];
  if (!id) return <p className="ed-empty">요소를 고르면 서식을 만질 수 있습니다.</p>;

  const style = doc.patches[id]?.style;
  const overridden = Object.keys(style ?? {}).length;

  /**
   * 항목 하나만 되돌린다.
   * 개별 지정은 항목 단위다 — 크기를 바꿔도 색·굵기·정렬은 계속 위계를 따른다.
   * 그래서 되돌리기도 항목 단위여야 한다.
   */
  const reset = (key: keyof StylePatch) => api.run({ type: 'clearStyle', ids: selection, keys: [key] });
  const mark = (key: keyof StylePatch) => (style?.[key] === undefined ? null : (
    <button
      className="ed-revert"
      title={`이 항목만 위계 기본값으로 되돌립니다 (다른 항목은 그대로)`}
      onClick={() => reset(key)}
    >되돌리기</button>
  ));

  return (
    <>
      <section className="ed-section">
        <h2 className="ed-section__title">
          글자
          {overridden > 0 && <span className="ed-badge">개별 지정 {overridden}항목</span>}
        </h2>
        <p className="ed-note">
          바꾼 <b>그 항목만</b> 개별값이 됩니다. 나머지는 계속 위계를 따릅니다.
          항목별로 하나씩 되돌릴 수 있습니다.
        </p>

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
            {mark('fontSize')}
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
            {mark('fontWeight')}
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
            {mark('letterSpacing')}
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
            {mark('lineHeight')}
          </span>
        </div>

        <div className="ed-field">
          <span className="ed-field__label">문단 정렬</span>
          <span className="ed-field__control">
            {TEXT_ALIGNS.map(([a, label]) => (
              <button key={a} className="ed-btn" aria-pressed={style?.textAlign === a}
                onClick={() => api.styleSelected({ textAlign: a })}>{label}</button>
            ))}
            {mark('textAlign')}
          </span>
        </div>

        <button
          className="ed-btn"
          disabled={overridden === 0}
          title="이 요소의 개별 지정을 전부 지웁니다"
          onClick={() => api.clearStyleSelected()}
        >개별 지정 모두 지우기</button>
      </section>

      <ColorField label="글자색" tokens={tokens} value={style?.color}
        onPick={(color) => api.styleSelected({ color })} onReset={() => reset('color')} />
      <ColorField label="배경" tokens={tokens} value={style?.background}
        onPick={(background) => api.styleSelected({ background })} onReset={() => reset('background')} />
      <ColorField label="테두리" tokens={tokens} value={style?.borderColor}
        onPick={(borderColor) => api.styleSelected({ borderColor })} onReset={() => reset('borderColor')} />

      {shapeVars.length > 0 && (
        <section className="ed-section">
          <h2 className="ed-section__title">도형 색</h2>
          <p className="ed-note">
            이 도형이 쓰는 변수입니다. 하나를 바꾸면 그것을 쓰는 모든 획과 면이 함께 바뀝니다.
          </p>
          {shapeVars.map((name) => (
            <div className="ed-field" key={name}>
              <span className="ed-field__label" title={name}>{name.replace('--', '')}</span>
              <span className="ed-field__control">
                <select
                  className="ed-select"
                  value={style?.vars?.[name] ?? ''}
                  onChange={(e) => api.styleSelected({
                    vars: { ...style?.vars, [name]: (e.target.value || undefined) as ColorRef },
                  })}
                >
                  <option value="">원래 색</option>
                  {tokens.map((t) => <option key={t.name} value={t.ref}>{t.name}</option>)}
                </select>
                {style?.vars?.[name] && (
                  <button className="ed-revert" onClick={() => reset('vars')}>되돌리기</button>
                )}
              </span>
            </div>
          ))}
        </section>
      )}

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
  label, tokens, value, onPick, onReset,
}: {
  label: string;
  tokens: KgToken[];
  value?: ColorRef;
  onPick(ref: ColorRef): void;
  onReset(): void;
}) {
  return (
    <section className="ed-section">
      <h2 className="ed-section__title">
        {label}
        {value !== undefined && (
          <button className="ed-revert" title="이 항목만 되돌립니다" onClick={onReset}>되돌리기</button>
        )}
      </h2>
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
