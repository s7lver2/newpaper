import { useI18n } from '@newpaper/i18n/react';
import { useEffect, useState, type CSSProperties } from 'react';
import { buildReport, formatBytes } from '../aboutReport';
import { Toast } from '../components';
import { ipc, type AboutInfo } from '../ipc';
import { Bar } from './Bar';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sin API de portapapeles (o sin permiso): vía de respaldo con un campo temporal.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function Rows({ rows, offset = 0 }: { rows: [string, string][]; offset?: number }) {
  return (
    <div className="m-group m-stagger">
      {rows.map(([k, v], i) => (
        <div key={k} className="m-row" style={{ '--i': offset + i, minHeight: 52 } as CSSProperties}>
          <span className="m-row-body"><b style={{ fontSize: 14, color: 'var(--np-muted)', fontWeight: 400 }}>{k}</b></span>
          <span className="m-about-v">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Acerca de: datos de la compilación, del sistema y de la app, con un botón para copiar un resumen para informes de errores. */
export function About() {
  const { t, locale, formatDate } = useI18n();
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    void ipc.about().then(setInfo).catch(() => setFailed(true));
  }, []);
  const copy = async () => {
    if (!info) return;
    setToast((await copyText(buildReport(info, locale))) ? t('mobile.about.copied') : t('mobile.about.copyFailed'));
    setTimeout(() => setToast(null), 2000);
  };
  const unknown = t('mobile.about.unknown');
  const b = info?.build;
  const d = info?.device;
  return (
    <section>
      <Bar title={t('mobile.about.title')} />
      {failed ? <p role="alert" className="m-empty">{t('mobile.about.failed')}</p> : null}
      {!info && !failed ? (
        <div style={{ padding: '16px var(--m-gutter)', display: 'grid', gap: 12 }}>
          <span className="m-skel" style={{ height: 96 }} />
          <span className="m-skel" style={{ height: 180 }} />
        </div>
      ) : null}
      {info && b && d ? (
        <>
          <div className="m-about-head">
            <span className="m-about-name">{t('app.name')}</span>
            <span className="m-about-ver">{t('mobile.about.version', { version: b.version })}</span>
            <span className={`m-about-chip ${b.profile === 'release' ? 'rel' : 'dbg'}`}>{b.profile === 'release' ? t('mobile.about.release') : t('mobile.about.debug')}</span>
          </div>
          <h2 className="m-sec">{t('mobile.about.build')}</h2>
          <Rows
            rows={[
              [t('mobile.about.builtAt'), b.builtAt > 0 ? formatDate(new Date(b.builtAt * 1000), { dateStyle: 'medium', timeStyle: 'short' }) : unknown],
              [t('mobile.about.commit'), b.git === 'dev' ? 'dev' : `${b.git}${b.gitDirty ? ' +' : ''}`],
            ]}
          />
          <h2 className="m-sec">{t('mobile.about.system')}</h2>
          <Rows
            offset={2}
            rows={[
              [t('mobile.about.android'), `${d.androidRelease || unknown} · API ${d.sdk}`],
              [t('mobile.about.device'), [d.manufacturer, d.model].filter(Boolean).join(' ') || unknown],
              [t('mobile.about.abi'), d.abi ?? unknown],
              [t('mobile.about.webview'), d.webview ?? unknown],
            ]}
          />
          <h2 className="m-sec">{t('mobile.about.app')}</h2>
          <Rows
            offset={6}
            rows={[
              [t('mobile.about.locale'), locale],
              [t('mobile.about.network'), info.netMode ? t(`mobile.about.net.${info.netMode}`) : unknown],
              [t('mobile.about.data'), formatBytes(info.dataBytes, locale)],
            ]}
          />
          {b.deps.length ? (
            <>
              <h2 className="m-sec">{t('mobile.about.components')}</h2>
              <Rows offset={9} rows={b.deps.map(([n, v]) => [n, v] as [string, string])} />
              <p className="m-hint">{t('mobile.about.licensesNote')}</p>
            </>
          ) : null}
          <div className="m-btn-row" style={{ marginTop: 18, flexDirection: 'column' }}>
            <button type="button" className="m-btn" onClick={() => void copy()}>{t('mobile.about.copy')}</button>
          </div>
          <p className="m-hint">{t('mobile.about.copyHint')}</p>
        </>
      ) : null}
      <Toast text={toast} />
    </section>
  );
}
