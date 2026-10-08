import { useI18n } from '@newpaper/i18n/react';
import { countryName } from './countries';
import { usePrivacyStatus, useTodayBlocked } from './usePrivacy';

/** Second line of the "Privacidad y red" entry in the settings sidebar ("Tor · España"). */
export function RedSummary() {
  const { t, locale } = useI18n();
  const status = usePrivacyStatus();
  if (!status) return null;
  if (status.mode === 'direct') return <>{t('privacy.settings.summaryDirect')}</>;
  return <>{t('privacy.settings.summaryTor', { country: status.exitCountry ? countryName(status.exitCountry, locale) : t('privacy.tor.autoCountry') })}</>;
}

/** Second line of the "Bloqueo" entry ("1832 hoy"). */
export function BlockingSummary() {
  const { t, formatNumber } = useI18n();
  const today = useTodayBlocked();
  return <>{t('privacy.blocking.summary', { count: formatNumber(today, { useGrouping: false }) })}</>;
}
