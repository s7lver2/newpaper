import { useT } from '@newpaper/i18n/react';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import { useSetting } from '../../state/settings';
import { OFFLINE_DEFAULTS } from './OfflineSection';

/** Segunda línea de «Fuentes» en la barra de ajustes («34 medios»). */
export function SourcesSummary() {
  const t = useT();
  const [locale] = useSetting<string>('content.locale', 'es');
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void commands.outletsList().then((all) => alive && setN(all.filter((o) => o.language === locale).length));
    return () => { alive = false; };
  }, [locale]);
  return n === null ? null : <>{t('sources.settings.summary', { count: n })}</>;
}

/** Segunda línea de «Sin conexión» («Edición a las 07:00»). */
export function OfflineSummary() {
  const t = useT();
  const [s] = useSetting<Partial<typeof OFFLINE_DEFAULTS>>('offline.settings', {});
  const merged = { ...OFFLINE_DEFAULTS, ...s };
  return <>{merged.enabled ? t('sources.offline.summaryAt', { time: merged.time }) : t('sources.offline.summaryOff')}</>;
}
