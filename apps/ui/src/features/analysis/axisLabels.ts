import { useI18n } from '@newpaper/i18n/react';
import type { FramingAxisLabels } from '@newpaper/ui-kit';
import { useMemo } from 'react';

export function useAxisLabels(): FramingAxisLabels {
  const { t } = useI18n();
  return useMemo(
    () => ({
      axis: t('analysis.axis.label'),
      left: t('analysis.axis.left'),
      center: t('analysis.axis.center'),
      right: t('analysis.axis.right'),
      article: t('analysis.axis.article'),
      me: t('analysis.axis.me'),
      band: t('analysis.axis.band'),
      groupCenter: t('analysis.axis.groupCenter'),
      notDeterminable: t('analysis.verdictText.no_determinable'),
    }),
    [t],
  );
}
