import type { CSSProperties } from 'react';
import { metaOf } from './providerMeta';

/**
 * Ficha de color con la marca del proveedor (o su monograma). `size` y `radius` en px, como en los mockups;
 * `mark` y `mono` fijan el tamaño del logo y del monograma cuando el mockup no usa la proporción habitual.
 */
export function ProviderLogo({ id, size, radius, mark, mono, className, style }: { id: string; size: number; radius: number; mark?: number; mono?: number; className?: string; style?: CSSProperties }) {
  const m = metaOf(id);
  const markPx = mark ?? Math.round(size * 0.52);
  return (
    <span
      className={['np-plogo', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={{ '--tint': m.tint, width: size, height: size, borderRadius: radius, ...style } as CSSProperties}
    >
      {m.svg ? (
        <span className="np-plogo-mark" style={{ width: markPx, height: markPx }} dangerouslySetInnerHTML={{ __html: m.svg }} />
      ) : (
        <span className="np-plogo-mono" style={{ fontSize: mono ?? Math.round(size * 0.36) }}>{m.mono}</span>
      )}
    </span>
  );
}
