/**
 * 진행 표시와 알림.
 *
 * 저장은 파일을 여러 개 쓰는 동안 화면이 멀쩡해 보여서, 다 됐는지 아닌지 알 수 없다.
 * 그래서 진행 중에는 화면을 막고, 끝나면 아래 가운데에 결과를 띄운다.
 *
 * 화면을 막는 이유는 예의가 아니라 정합성이다. 저장하는 도중에 문서를 고치면
 * 파일에 들어간 내용과 화면이 갈라진다.
 */
import { useEffect, useState } from 'react';
import type { Busy, EditorApi, Toast as ToastItem } from './editor';

const LIFETIME = 2600;

export function Toasts({ api }: { api: EditorApi }) {
  const [busy, setBusy] = useState<Busy>({ active: false, message: '' });
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => api.onBusy(setBusy), [api]);

  useEffect(() => api.onToast((t) => {
    setItems((prev) => [...prev.slice(-2), t]);
    window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), LIFETIME);
  }), [api]);

  return (
    <>
      {busy.active && (
        <div className="ed-blocker" role="alertdialog" aria-busy="true" aria-label={busy.message}>
          <div className="ed-blocker__box">
            <span className="ed-spinner" aria-hidden="true" />
            <span>{busy.message}</span>
          </div>
        </div>
      )}

      <div className="ed-toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="ed-toast" data-kind={t.kind}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
