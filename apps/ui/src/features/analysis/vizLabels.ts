import { useI18n } from '@newpaper/i18n/react';
import type { VizLabels } from '@newpaper/ui-kit';
import { useMemo } from 'react';

export function useVizLabels() {
  const { t, formatNumber, locale } = useI18n();
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    const labels: VizLabels = {
      sources: t('charts.sources'),
      showTable: t('charts.showTable'),
      showChart: t('charts.showChart'),
      label: t('charts.label'),
      value: t('charts.value'),
      region: t('charts.region'),
      matrix: (c) => t(`charts.matrix.${c}`),
      parliament: {
        chart: t('charts.parliament.chart'),
        majority: (n) => t('charts.parliament.majority', { n }),
        seatsFor: (n) => t('charts.parliament.seatsFor', { n }),
        reached: t('charts.parliament.reached'),
        short: (n) => t('charts.parliament.short', { n }),
        hint: t('charts.parliament.hint'),
        party: t('charts.parliament.party'),
        seats: t('charts.parliament.seats'),
        vote: t('charts.parliament.vote'),
        yes: t('charts.parliament.yes'),
        no: t('charts.parliament.no'),
        reset: t('charts.parliament.reset'),
      },
    };
    const regionName = (code: string) => (/^[A-Z]{2}$/i.test(code) ? (names.of(code.toUpperCase()) ?? code) : code);
    return { labels, format: (n: number) => formatNumber(n), regionName };
  }, [t, formatNumber, locale]);
}
