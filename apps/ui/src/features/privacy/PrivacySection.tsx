import { useI18n } from '@newpaper/i18n/react';
import { Button, SegmentedControl, Switch } from '@newpaper/ui-kit';
import { useState } from 'react';
import { commands } from '../../ipc/commands';
import type { NetMode } from '../../ipc/types';
import { countryName, EXIT_COUNTRIES } from './countries';
import { PinMap, type MapZoom } from './DotMap';
import { TorRoute } from './TorRoute';
import { torStateLabel } from './TorPopup';
import { applyStatus, usePrivacyStatus } from './usePrivacy';

export function PrivacySection() {
  const { t, locale } = useI18n();
  const status = usePrivacyStatus();
  const [zoom, setZoom] = useState<MapZoom>('world');
  if (!status) return null;
  const setMode = async (m: NetMode) => applyStatus(await commands.netSetMode(m));
  const setCountry = async (code: string) => applyStatus(await commands.torSetExitCountry(code === 'auto' ? null : code));
  const modes: { id: NetMode | 'wireguard'; title: string; desc: string; disabled?: boolean }[] = [
    { id: 'direct', title: t('privacy.settings.modeDirect'), desc: t('privacy.settings.modeDirectDesc') },
    { id: 'tor', title: t('privacy.settings.modeTor'), desc: t('privacy.settings.modeTorDesc') },
    { id: 'wireguard', title: t('privacy.settings.modeWireguard'), desc: t('privacy.settings.modeWireguardDesc'), disabled: true },
  ];
  return (
    <section className="np-settings-section np-stagger" aria-labelledby="np-set-privacy">
      <div>
        <h2 id="np-set-privacy" className="np-settings-h2">{t('privacy.settings.title')}</h2>
        <p className="np-settings-hint">{t('privacy.settings.restartNote')}</p>
      </div>
      <div role="radiogroup" aria-label={t('privacy.settings.connection')} className="np-modes">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={status.mode === m.id}
            disabled={m.disabled}
            className="np-mode"
            data-mode={m.id}
            onClick={() => m.id !== 'wireguard' && setMode(m.id)}
          >
            <strong>{m.title}</strong>
            <span className="np-mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>
      <p className="np-kicker" aria-live="polite">{torStateLabel(t, status)}</p>
      {status.mode === 'direct' ? (
        <p className="np-notice np-notice--warn np-rise">{t('privacy.tor.directNote')}</p>
      ) : (
        <div className="np-settings-card np-exit-card np-rise">
          <div className="np-exit-head">
            <div>
              <h3 className="np-settings-label">{t('privacy.settings.exitCountry')}</h3>
              <p className="np-settings-hint">{t('privacy.settings.exitHint')}</p>
            </div>
            <SegmentedControl<MapZoom>
              label={t('privacy.settings.zoom')}
              value={zoom}
              onChange={setZoom}
              options={[
                { value: 'world', label: t('privacy.settings.zoomWorld') },
                { value: 'europe', label: t('privacy.settings.zoomEurope') },
              ]}
            />
          </div>
          <PinMap active={status.exitCountry} zoom={zoom} locale={locale} onPick={setCountry} />
          <div role="radiogroup" aria-label={t('privacy.settings.exitCountry')} className="np-countries">
            {['auto', ...EXIT_COUNTRIES.map((c) => c.code)].map((code) => {
              const checked = (status.exitCountry ?? 'auto') === code;
              return (
                <button key={code} type="button" role="radio" aria-checked={checked} className="np-country np-hit" onClick={() => setCountry(code)}>
                  {code === 'auto' ? t('privacy.tor.autoCountry') : countryName(code, locale)}
                </button>
              );
            })}
          </div>
          <div className="np-exit-route">
            <TorRoute country={status.exitCountry ?? t('privacy.tor.auto')} />
            <span className="np-tor-circuit">{t('privacy.tor.circuit', { n: status.circuit })}</span>
            <Button className="np-exit-newcircuit" onClick={async () => applyStatus(await commands.torNewCircuit())}>{t('privacy.tor.newCircuit')}</Button>
          </div>
        </div>
      )}
      <h3 className="np-settings-label np-sr-only">{t('privacy.settings.routing')}</h3>
      <div className="np-settings-card np-switch-card">
        <Switch
          label={t('privacy.settings.feedsViaTor')}
          checked={status.feedsViaTor}
          onChange={async (v) => applyStatus(await commands.privacySetRouting({ feedsViaTor: v }))}
        />
        <Switch
          label={t('privacy.settings.aiViaTor')}
          description={t('privacy.settings.aiViaTorHint')}
          checked={status.aiViaTor}
          onChange={async (v) => applyStatus(await commands.privacySetRouting({ aiViaTor: v }))}
        />
      </div>
    </section>
  );
}
