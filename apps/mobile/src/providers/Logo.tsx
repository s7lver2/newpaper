import { metaOf } from '@newpaper/ui-kit/logic';

/** Logo de un proveedor en su ficha de color. Los SVG son marcas estáticas del repositorio (sin entrada del usuario). */
export function ProviderLogo({ id, size = 40 }: { id: string; size?: number }) {
  const m = metaOf(id);
  return (
    <span className="m-plogo" style={{ background: m.tint, width: size, height: size }} aria-hidden="true">
      {m.svg ? <span className="m-plogo-svg" dangerouslySetInnerHTML={{ __html: m.svg }} /> : <b>{m.mono ?? id.slice(0, 2)}</b>}
    </span>
  );
}
