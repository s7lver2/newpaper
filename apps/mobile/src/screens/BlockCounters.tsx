import { useI18n } from '@newpaper/i18n/react';
import { useEffect, useState } from 'react';
import { ConfirmSheet } from '../components';
import { useCountUp } from '../countUp';
import { ipc, type BlockCounts } from '../ipc';

function Big({ value, label, tone }: { value: number; label: string; tone: 'ads' | 'trackers' }) {
  const { formatNumber } = useI18n();
  const shown = useCountUp(value);
  return (
    <div className={`m-count m-count-${tone}`}>
      <b className="m-count-n" aria-label={`${formatNumber(value)} ${label}`}>{formatNumber(shown)}</b>
      <span>{label}</span>
    </div>
  );
}

/** Contadores de anuncios y rastreadores bloqueados (solo en «Ver original»: la lectura de newpaper no carga nada de eso). */
export function BlockCounters({ enabled }: { enabled: boolean }) {
  const { t, formatNumber, formatDate } = useI18n();
  const [c, setC] = useState<BlockCounts | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let live = true;
    const pull = () => void ipc.blockCounts().then((v) => live && setC(v)).catch(() => {});
    pull();
    const id = setInterval(pull, 3000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  if (!c) return <div style={{ padding: '12px 16px 0' }}><span className="m-skel" style={{ height: 120 }} /></div>;
  const empty = c.total.ads + c.total.trackers === 0;
  return (
    <>
      <h2 className="m-sec">{t('mobile.blocking.counters')}</h2>
      <div className="m-counts">
        <Big value={c.total.ads} label={t('mobile.blocking.ads')} tone="ads" />
        <Big value={c.total.trackers} label={t('mobile.blocking.trackers')} tone="trackers" />
      </div>
      {empty ? (
        <p className="m-hint">{enabled ? t('mobile.blocking.empty') : t('mobile.blocking.emptyOff')}</p>
      ) : (
        <>
          <p className="m-hint m-counts-sub">
            {t('mobile.blocking.today', { ads: formatNumber(c.today.ads), trackers: formatNumber(c.today.trackers) })}
            {c.since ? ` · ${t('mobile.blocking.since', { date: formatDate(new Date(`${c.since}T12:00:00`), { dateStyle: 'medium' }) })}` : ''}
          </p>
          <div className="m-btn-row" style={{ marginTop: 4 }}>
            <button type="button" className="m-btn sec sm" onClick={() => setConfirm(true)}>{t('mobile.blocking.reset')}</button>
          </div>
        </>
      )}
      {confirm ? (
        <ConfirmSheet
          title={t('mobile.blocking.resetTitle')}
          body={t('mobile.blocking.resetBody')}
          confirm={t('mobile.blocking.resetDo')}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void ipc.blockReset().then((v) => { setC(v); setConfirm(false); }).catch(() => setConfirm(false))}
        />
      ) : null}
    </>
  );
}
