import { useT } from '@newpaper/i18n/react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { OutletLean } from '../../ipc/types';
import { layoutAxis, sideOf } from './leanModel';

/**
 * Eje izquierda–derecha con una etiqueta por medio (mockup Ajustes › Fuentes). Pulsar una etiqueta selecciona el medio;
 * los medios desactivados se dibujan con borde discontinuo y los que aún no tienen posición, aparte.
 */
export function OutletAxis({ outlets, selected, disabled, onPick }: { outlets: OutletLean[]; selected: string | null; disabled: Set<string>; onPick(id: string): void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(820);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => el.clientWidth > 0 && setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const placed = useMemo(() => outlets.filter((o) => o.effective !== null), [outlets]);
  const pending = outlets.filter((o) => o.effective === null);
  const layout = useMemo(() => layoutAxis(placed, width), [placed, width]);
  let l = 0;
  let c = 0;
  let r = 0;
  for (const o of placed) {
    if (disabled.has(o.outletId)) continue;
    const s = sideOf(o.effective as number);
    if (s === 'left') l++;
    else if (s === 'right') r++;
    else c++;
  }
  const balanced = Math.abs(l - r) <= 1;
  return (
    <div className="np-src-axiscard">
      <div ref={box} className="np-src-axis" style={{ height: layout.height }}>
        <div className="np-src-axisline" style={{ top: layout.lineY }} aria-hidden="true" />
        {layout.pills.map(({ outlet: o, x, top }) => (
          <button
            key={o.outletId}
            type="button"
            className="np-src-pill"
            data-side={sideOf(o.effective as number)}
            data-off={disabled.has(o.outletId)}
            aria-pressed={selected === o.outletId}
            style={{ left: `${x}%`, top }}
            onClick={() => onPick(o.outletId)}
          >
            {o.name}
          </button>
        ))}
      </div>
      <div className="np-src-axislabels"><span>{t('sources.axis.left')}</span><span>{t('sources.axis.center')}</span><span>{t('sources.axis.right')}</span></div>
      {pending.length ? (
        <div className="np-src-pending">
          <span className="np-src-pending-title">{t('sources.axis.pending')}</span>
          {pending.map((o) => (
            <button key={o.outletId} type="button" className="np-src-pill np-src-pill--static" data-off="true" aria-pressed={selected === o.outletId} onClick={() => onPick(o.outletId)}>{o.name}</button>
          ))}
        </div>
      ) : null}
      <div className="np-src-balance" data-ok={balanced} role="status">
        {t('sources.axis.balance', { left: l, center: c, right: r })} — {t(balanced ? 'sources.axis.balanced' : 'sources.axis.unbalanced')}
      </div>
    </div>
  );
}
