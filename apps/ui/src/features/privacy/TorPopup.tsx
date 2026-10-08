import { useI18n } from '@newpaper/i18n/react';
import type { Translator } from '@newpaper/i18n';
import { Button, useReducedMotion } from '@newpaper/ui-kit';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { commands } from '../../ipc/commands';
import type { PrivacyStatus } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import { countryName, EXIT_COUNTRIES } from './countries';
import { RouteMap } from './DotMap';
import { TorRoute } from './TorRoute';
import { applyStatus, usePrivacyStatus } from './usePrivacy';
import { requestOpenWithoutTor } from './withoutTor';

export function torStateLabel(t: Translator['t'], s: PrivacyStatus): string {
  if (s.mode === 'direct') return t('privacy.tor.chipDirect');
  switch (s.tor.state) {
    case 'ready': return t('privacy.tor.stateReady');
    case 'bootstrapping': return t('privacy.tor.stateBootstrapping', { percent: s.tor.percent });
    case 'failed': return t('privacy.tor.stateFailed');
    default: return t('privacy.tor.stateOff');
  }
}

const OPTIONS = ['auto', ...EXIT_COUNTRIES.map((c) => c.code)];
/** The plane takes 1.8 s to fly the arc; the controls stay locked a little longer, like the mockup. */
const FLIGHT_MS = 1900;

const Arrow = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'l' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);

export function TorPopup({ tabId, onClose }: { tabId: number | null; onClose(): void }) {
  const { t, locale } = useI18n();
  const status = usePrivacyStatus();
  const reduced = useReducedMotion();
  const current = status?.exitCountry ?? 'auto';
  const [index, setIndex] = useState(() => Math.max(0, OPTIONS.indexOf(current)));
  const [dir, setDir] = useState<'l' | 'r'>('r');
  const [swipe, setSwipe] = useState(0);
  const [flight, setFlight] = useState<{ id: number; from: string; to: string } | null>(null);
  const flightCount = useRef(0);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!status) return null;
  const name = (code: string) => (code === 'auto' ? t('privacy.tor.autoCountry') : countryName(code, locale));
  const short = (code: string) => (code === 'auto' ? t('privacy.tor.auto') : code);
  const candidate = OPTIONS[index]!;
  const flying = flight !== null;
  const move = (d: number) => {
    setIndex((i) => (i + d + OPTIONS.length) % OPTIONS.length);
    setDir(d < 0 ? 'l' : 'r');
    setSwipe((n) => n + 1);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
  };
  const fly = async () => {
    const id = ++flightCount.current;
    setFlight({ id, from: current, to: candidate });
    const minimum = new Promise((r) => setTimeout(r, reduced ? 0 : FLIGHT_MS));
    try {
      const [next] = await Promise.all([commands.torSetExitCountry(candidate === 'auto' ? null : candidate), minimum]);
      applyStatus(next);
    } finally {
      setFlight(null);
    }
  };

  // Map framing: during a flight it shows the trip; otherwise the current exit and the candidate being browsed.
  const fromCode = flight ? flight.from : current;
  const toCode = flight ? flight.to : candidate;
  const asCode = (c: string) => (c === 'auto' ? null : c);
  const mapLabel = fromCode === toCode ? t('privacy.tor.routeExit', { country: short(fromCode) }) : `${short(fromCode)} → ${short(toCode)}`;

  const ready = status.mode === 'tor' && status.tor.state === 'ready';
  const statusText = flying
    ? t('privacy.tor.building')
    : ready
      ? current === 'auto' ? t('privacy.tor.statusExitAuto') : t('privacy.tor.statusExit', { country: name(current) })
      : torStateLabel(t, status);
  const flyLabel = flight
    ? t('privacy.tor.flying', { country: name(flight.to) })
    : candidate === current
      ? t('privacy.tor.flyHere')
      : candidate === 'auto' ? t('privacy.tor.flyAuto') : t('privacy.tor.fly', { country: name(candidate) });

  return (
    <div role="dialog" aria-label={t('privacy.tor.popupTitle')} className="np-popover np-tor-popup">
      {status.mode === 'direct' ? (
        <div className="np-tor-body">
          <p className="np-tor-note">{t('privacy.tor.directNote')}</p>
          <Button variant="primary" onClick={async () => applyStatus(await commands.netSetMode('tor'))}>{t('privacy.tor.enable')}</Button>
        </div>
      ) : (
        <>
          <div className="np-tor-map">
            <RouteMap from={asCode(fromCode)} to={asCode(toCode)} flightId={flight && !reduced ? flight.id : null} />
            <span className="np-tor-maplabel">{mapLabel}</span>
          </div>
          <div className="np-tor-picker" onKeyDown={onKey}>
            <button type="button" className="np-tor-step" aria-label={t('privacy.tor.prev')} title={t('privacy.tor.prev')} onClick={() => move(-1)}>
              <Arrow dir="l" />
            </button>
            <div className="np-tor-candidate" aria-live="polite">
              <div key={swipe} className="np-tor-swipe" data-dir={dir} data-first={swipe === 0}>
                <span className="np-tor-candidate-code">{short(candidate)}</span>
                <span className="np-tor-candidate-name">{name(candidate)}</span>
                <span className="np-tor-candidate-sub">{candidate === current ? t('privacy.tor.current') : ' '}</span>
              </div>
            </div>
            <button type="button" className="np-tor-step" aria-label={t('privacy.tor.next')} title={t('privacy.tor.next')} onClick={() => move(1)}>
              <Arrow dir="r" />
            </button>
          </div>
          <div className="np-tor-pager" aria-hidden="true">
            {OPTIONS.map((code, i) => (
              <span key={code} className="np-tor-pip" data-on={i === index} data-current={code === current && i !== index} />
            ))}
          </div>
          {candidate !== 'auto' ? <p className="np-tor-note np-tor-hint">{t('privacy.tor.reducesAnonymity')}</p> : null}
          <div className="np-tor-flywrap">
            <Button className="np-tor-fly" data-flying={flying} data-here={candidate === current && !flying} disabled={flying || candidate === current} onClick={fly}>
              {flyLabel}
            </Button>
          </div>
          <div className="np-tor-extra">
            <TorRoute country={short(current)} className="np-route--compact" />
            <div className="np-tor-actions">
              <span className="np-tor-circuit">{t('privacy.tor.circuit', { n: status.circuit })}</span>
              <Button variant="quiet" onClick={async () => applyStatus(await commands.torNewCircuit(tabId ?? undefined))}>{t('privacy.tor.newCircuit')}</Button>
              {tabId !== null && !status.tabsWithoutTor.includes(tabId) ? (
                <Button variant="quiet" onClick={() => { requestOpenWithoutTor(tabId); onClose(); }}>{t('privacy.tor.withoutTorAction')}</Button>
              ) : null}
            </div>
          </div>
        </>
      )}
      <div className="np-tor-foot">
        <span className="np-tor-status" data-state={flying ? 'building' : status.mode === 'direct' ? 'off' : status.tor.state} aria-live="polite">
          <span className={flying || status.tor.state === 'bootstrapping' || ready ? 'np-tor-dot np-pulse' : 'np-tor-dot'} aria-hidden="true" />
          {statusText}
        </span>
        <button type="button" className="np-tor-more np-hit" onClick={() => { onClose(); void openInternal('ajustes', ['red']); }}>{t('privacy.tor.more')}</button>
      </div>
    </div>
  );
}
