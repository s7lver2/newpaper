import { useT } from '@newpaper/i18n/react';
import { useSetting } from '../../state/settings';

const KEY: Record<string, string> = {
  '7': 'settings.data.retention7',
  '30': 'settings.data.retention30',
  '90': 'settings.data.retention90',
  '365': 'settings.data.retention365',
  forever: 'settings.data.retentionForever',
};

/** Second line of the "Datos e historial" entry in the settings sidebar: how long the history is kept. */
export function DataSummary() {
  const t = useT();
  const [days] = useSetting<number | null>('history.retentionDays', 90);
  return <>{t(KEY[days === null ? 'forever' : String(days)] ?? KEY['90']!)}</>;
}
