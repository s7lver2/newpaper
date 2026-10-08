import { useI18n } from '@newpaper/i18n/react';
import { Button, ReaderView } from '@newpaper/ui-kit';
import { convertFileSrc } from '@tauri-apps/api/core';
import { commands } from '../ipc/commands';
import { navigate } from './navigate';
import type { ReaderSurfaceProps } from './registry';

export const rewriteImage = (absUrl: string): string => convertFileSrc(absUrl, 'npimg');

export function DefaultReader({ tab, page }: ReaderSurfaceProps) {
  const { t, formatDate } = useI18n();
  const a = page;
  const published = a.published && !Number.isNaN(Date.parse(a.published)) ? formatDate(new Date(a.published), { dateStyle: 'long' }) : null;
  return (
    <div className="np-surface">
      <div className="np-reader-actions">
        <Button variant="quiet" onClick={() => commands.tabSetView(tab.id, 'original')}>
          {t('shell.reader.original')}
        </Button>
      </div>
      <ReaderView
        article={a}
        rewriteImage={rewriteImage}
        onOpenLink={(url) => navigate(url)}
        meta={
          <>
            {a.siteName ? <span>{a.siteName}</span> : null}
            {a.byline ? <span>{t('shell.reader.byline', { name: a.byline })}</span> : null}
            {published ? <time dateTime={a.published ?? undefined}>{published}</time> : null}
          </>
        }
      />
    </div>
  );
}
