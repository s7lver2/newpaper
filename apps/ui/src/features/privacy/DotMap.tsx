import { memo, type CSSProperties } from 'react';
import { countryCoords, countryName, EXIT_COUNTRIES } from './countries';
import { fracX, fracY, LAND_DOTS, MAP_H, MAP_W } from './worldMap';

/** Land dots of the 72 x 28 matrix, positioned as percentages of the map box. */
const LandDots = memo(function LandDots({ className }: { className: string }) {
  return (
    <>
      {LAND_DOTS.map((d, i) => (
        <i key={i} className={className} style={{ left: `${d.left}%`, top: `${d.top}%` }} />
      ))}
    </>
  );
});

const EASE = 'cubic-bezier(.65,0,.35,1)';
/** Visible area of the popup map. */
const VW = 300;
const VH = 118;

const px = (lon: number) => fracX(lon) * MAP_W;
const py = (lat: number) => fracY(lat) * MAP_H;

/** Same glyph as the mockup: the plane flies along the dotted arc from the old exit to the new one. */
const PLANE_PATH = 'M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2-7h-4l-2 2h-3l2-4-2-4h3l2 2h4l-2-7h3z';

export interface RouteMapView {
  /** Country code or null (automatic: nothing to place on the map). */
  from: string | null;
  to: string | null;
}

/**
 * Popup map: a 1000 x 389 layer that is panned and zoomed so that origin and destination are framed, with
 * a dotted arc between them, a filled pin on the current exit, a ringed pin on the candidate and, during
 * a flight, a plane following the arc. Same projection and framing maths as the mockup.
 */
export function RouteMap({ from, to, flightId }: RouteMapView & { flightId: number | null }) {
  const pa = countryCoords(from);
  const pb = countryCoords(to);
  const a = pa ?? pb;
  const b = pb ?? pa;
  let layerTransform: string;
  let arc = 'M0 0';
  let inv = 1;
  let ax = 0, ay = 0, bx = 0, by = 0;
  let distinct = false;
  if (a && b) {
    ax = px(a.lon); ay = py(a.lat); bx = px(b.lon); by = py(b.lat);
    distinct = pa !== null && pb !== null && from !== to;
    const dd = Math.hypot(bx - ax, by - ay);
    if (distinct) arc = `M${ax.toFixed(1)} ${ay.toFixed(1)} Q${((ax + bx) / 2).toFixed(1)} ${(Math.min(ay, by) - 20 - dd * 0.22).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
    const vs = Math.max(0.26, Math.min(1.7, (VW * 0.78) / (Math.abs(bx - ax) + 70), (VH * 0.62) / (Math.abs(by - ay) + 60 + dd * 0.12)));
    const vcx = (ax + bx) / 2;
    const vcy = (ay + by) / 2 - dd * 0.06;
    inv = 1 / vs;
    layerTransform = `translate(${(VW / 2 - vcx * vs).toFixed(1)}px,${(VH / 2 - vcy * vs).toFixed(1)}px) scale(${vs.toFixed(3)})`;
  } else {
    const vs = VW / MAP_W;
    inv = 1 / vs;
    layerTransform = `translate(0px,${((VH - MAP_H * vs) / 2).toFixed(1)}px) scale(${vs.toFixed(3)})`;
  }
  const pin = (c: { lat: number; lon: number }, kind: 'exit' | 'cand'): CSSProperties => ({
    left: px(c.lon),
    top: py(c.lat),
    transform: `translate(-50%,-50%) scale(${inv.toFixed(3)})`,
    ...(kind === 'exit'
      ? { width: 14, height: 14, background: 'var(--np-tor)', boxShadow: '0 0 0 3px var(--np-card)' }
      : { width: 12, height: 12, background: 'var(--np-card)', boxShadow: '0 0 0 2.5px var(--np-tor)' }),
  });
  return (
    <div className="np-tor-viewport" aria-hidden="true" style={{ width: VW, height: VH }}>
      <div className="np-map-layer" style={{ width: MAP_W, height: MAP_H, transform: layerTransform, transition: `transform 1s ${EASE}` }}>
        <LandDots className="np-ld" />
        <svg width={MAP_W} height={MAP_H} className="np-map-arc" style={{ opacity: distinct ? 1 : 0 }}>
          <path d={arc} fill="none" stroke="var(--np-tor)" strokeWidth="1.6" strokeDasharray="3 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {pa ? <span className="np-map-pin" style={pin(pa, 'exit')} /> : null}
        {pb && from !== to ? <span className="np-map-pin" style={pin(pb, 'cand')} /> : null}
        {flightId !== null && distinct ? (
          <div
            key={flightId}
            className="np-map-plane"
            style={{ offsetPath: `path('${arc}')`, transform: `scale(${inv.toFixed(3)})` }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--np-ink)" stroke="var(--np-card)" strokeWidth="1" strokeLinejoin="round">
              <path d={PLANE_PATH} />
            </svg>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type MapZoom = 'world' | 'europe';

/**
 * Settings map: the full matrix with one pin per exit country. "Europa" zooms the layer 3.4x around
 * western Europe, where most exits are. Pins are a pointer shortcut; the radio list below is the accessible control.
 */
export function PinMap({ active, zoom, locale, onPick }: { active: string | null; zoom: MapZoom; locale: string; onPick(code: string): void }) {
  const sc = zoom === 'europe' ? 3.4 : 1;
  const ox = 51.5;
  const oy = 24;
  return (
    <div className="np-pinmap" data-zoom={zoom}>
      <div className="np-pinmap-layer" style={{ transformOrigin: `${ox}% ${oy}%`, transform: `scale(${sc})` }}>
        <LandDots className="np-d" />
      </div>
      {EXIT_COUNTRIES.map((c, i) => {
        const on = c.code === active;
        const x = ox + (fracX(c.lon) * 100 - ox) * sc;
        const y = oy + (fracY(c.lat) * 100 - oy) * sc;
        return (
          <button
            key={c.code}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="np-pin"
            data-active={on}
            style={{ left: `${x.toFixed(2)}%`, top: `${y.toFixed(2)}%`, zIndex: on ? 3 : 2, animationDelay: `${250 + i * 45}ms` }}
            onClick={() => onPick(c.code)}
          >
            {on ? <span className="np-pin-ping" /> : null}
            <span className="np-pin-dot" />
            {on ? <span className="np-pin-tip">{countryName(c.code, locale)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
