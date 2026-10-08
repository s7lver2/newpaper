import { useI18n } from '@newpaper/i18n/react';
import type { Translator } from '@newpaper/i18n';
import { Button, IconButton, useReducedMotion } from '@newpaper/ui-kit';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { commands } from '../../ipc/commands';
import type { PrivacyStatus } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import { countryName, EXIT_COUNTRIES } from './countries';
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
const Arrow = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={dir === 'l' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
  </svg>
);
const Plane = () => (
  <svg className="np-plane" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
  </svg>
);

export function TorPopup({ tabId, onClose }: { tabId: number | null; onClose(): void }) {
  const { t, locale } = useI18n();
  const status = usePrivacyStatus();
  const reduced = useReducedMotion();
  const current = status?.exitCountry ?? 'auto';
  const [index, setIndex] = useState(() => Math.max(0, OPTIONS.indexOf(current)));
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!status) return null;
  const name = (code: string) => (code === 'auto' ? t('privacy.tor.autoCountry') : countryName(code, locale));
  const candidate = OPTIONS[index]!;
  const move = (d: number) => setIndex((i) => (i + d + OPTIONS.length) % OPTIONS.length);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
  };
  const fly = async () => {
    setFlying(true);
    try {
      applyStatus(await commands.torSetExitCountry(candidate === 'auto' ? null : candidate));
    } finally {
      setTimeout(() => setFlying(false), reduced ? 0 : 900);
    }
  };

  return (
    <div role="dialog" aria-label={t('privacy.tor.popupTitle')} className="np-popover np-tor-popup np-pop">
      <p className="np-kicker" aria-live="polite">{torStateLabel(t, status)}</p>
      {status.mode === 'direct' ? (
        <>
          <p className="np-tor-note">{t('privacy.tor.directNote')}</p>
          <Button variant="primary" onClick={async () => applyStatus(await commands.netSetMode('tor'))}>{t('privacy.tor.enable')}</Button>
        </>
      ) : (
        <>
          <div className="np-tor-route">
            <span>{t('privacy.tor.routeYou')}</span><span aria-hidden="true">→</span>
            <span>{t('privacy.tor.routeGuard')}</span><span aria-hidden="true">→</span>
            <span>{t('privacy.tor.routeMiddle')}</span><span aria-hidden="true">→</span>
            <span>{t('privacy.tor.routeExit', { country: current === 'auto' ? t('privacy.tor.auto') : current })}</span>
          </div>
          <div className="np-tor-picker" onKeyDown={onKey}>
            <IconButton label={t('privacy.tor.prev')} icon={<Arrow dir="l" />} onClick={() => move(-1)} />
            <div className="np-tor-candidate" aria-live="polite">
              <span className="np-tor-candidate-code">{candidate === 'auto' ? t('privacy.tor.auto') : candidate}</span>
              <span>{name(candidate)}</span>
              {candidate === current ? <span className="np-tor-note">{t('privacy.tor.current')}</span> : null}
            </div>
            <IconButton label={t('privacy.tor.next')} icon={<Arrow dir="r" />} onClick={() => move(1)} />
          </div>
          {candidate !== 'auto' ? <p className="np-tor-note">{t('privacy.tor.reducesAnonymity')}</p> : null}
          <Button variant="primary" className="np-tor-fly" data-flying={flying} disabled={flying || candidate === current} onClick={fly}>
            <Plane />{' '}
            {flying ? t('privacy.tor.flying') : candidate === 'auto' ? t('privacy.tor.flyAuto') : t('privacy.tor.fly', { country: name(candidate) })}
          </Button>
          <div className="np-tor-route">
            <span>{t('privacy.tor.circuit', { n: status.circuit })}</span>
            <Button variant="quiet" onClick={async () => applyStatus(await commands.torNewCircuit(tabId ?? undefined))}>{t('privacy.tor.newCircuit')}</Button>
          </div>
          {tabId !== null && !status.tabsWithoutTor.includes(tabId) ? (
            <Button variant="quiet" onClick={() => { requestOpenWithoutTor(tabId); onClose(); }}>{t('privacy.tor.withoutTorAction')}</Button>
          ) : null}
        </>
      )}
      <Button variant="quiet" onClick={() => { onClose(); void openInternal('ajustes', ['red']); }}>{t('privacy.tor.more')}</Button>
    </div>
  );
}
