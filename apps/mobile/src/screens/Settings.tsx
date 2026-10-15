import { useI18n } from '@newpaper/i18n/react';
import type { ThemeChoice } from '@newpaper/ui-kit';
import { useEffect, useState, type ReactNode } from 'react';
import { IconChevron, IconSearch, RowIcon } from '../icons';
import { ipc } from '../ipc';
import { go } from '../router';
import { resetPipeline } from '../ai/pipeline';
import { ConfirmSheet, Switch, Toast } from '../components';
import { loadMotion, setMotion, setThemeChoice } from '../theme';
import { ConnectionCard } from './ConnectionCard';

type Icon = Parameters<typeof RowIcon>[0]['name'];
interface Row {
  id: string;
  label: string;
  sub?: string;
  icon: Icon;
  tone?: 'acc' | 'ok' | 'ai' | 'warn' | 'bad' | 'ink';
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  control?: ReactNode;
}
type Danger = 'history' | 'forget' | 'keys';

/** Ajustes del móvil: búsqueda, resumen de IA, grupos con cabecera, subpantallas y zona de peligro. La red es directa (Tor no está en Android). */
export function Settings() {
  const { t, locale, setLocale } = useI18n();
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [reduce, setReduce] = useState(false);
  const [danger, setDanger] = useState<Danger | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sysReduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    void ipc.settingsGet<string>('device.theme').then((v) => setTheme(v === 'paper' || v === 'ink' ? v : 'system')).catch(() => {});
    void loadMotion().then(setReduce);
  }, []);
  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };
  const runDanger = async (d: Danger) => {
    setBusy(true);
    try {
      if (d === 'history') await ipc.historyDelete({ scope: 'all' });
      else if (d === 'forget') {
        for (const p of await ipc.syncPeers()) if (!p.revoked) await ipc.syncRevoke(p.id);
      } else {
        const connected = (await ipc.settingsGet<string[]>('ai.connected')) ?? [];
        const custom = ((await ipc.settingsGet<{ id: string }[]>('ai.customEndpoints')) ?? []).map((c) => c.id);
        for (const id of new Set([...connected, ...custom])) await ipc.secretDelete(`ai.${id}`).catch(() => {});
        await ipc.settingsSet('ai.connected', []);
        await ipc.settingsSet('ai.assignments', {});
        resetPipeline();
      }
      say(t('mobile.settings.done'));
    } catch (e) {
      say(String((e as { message?: string }).message ?? e));
    } finally {
      setBusy(false);
      setDanger(null);
    }
  };
  const pick = (c: ThemeChoice) => {
    setTheme(c);
    void setThemeChoice(c);
  };
  const soon = t('mobile.settings.soon');
  const groups: { key: string; title: string; rows: Row[]; danger?: boolean }[] = [
    {
      key: 'ai',
      title: t('mobile.settings.g.ai'),
      rows: [
        { id: 'providers', label: t('mobile.settings.r.providers'), sub: t('mobile.settings.r.providersSub'), icon: 'ai', tone: 'ai', onPress: () => go('proveedor') },
        { id: 'pipeline', label: t('mobile.settings.r.pipeline'), sub: t('mobile.pipeline.lead'), icon: 'pipe', tone: 'acc', onPress: () => go('pipeline') },
      ],
    },
    {
      key: 'privacy',
      title: t('mobile.settings.g.privacy'),
      rows: [{ id: 'blocking', label: t('mobile.settings.r.blocking'), sub: t('mobile.settings.r.blockingSub'), icon: 'block', tone: 'ok', onPress: () => go('bloqueo') }],
    },
    {
      key: 'content',
      title: t('mobile.settings.g.content'),
      rows: [
        { id: 'sources', label: t('mobile.settings.r.sources'), sub: t('mobile.settings.r.sourcesSub'), icon: 'src', tone: 'ink', onPress: () => go('fuentes') },
        { id: 'offline', label: t('mobile.edition.title'), sub: t('mobile.edition.hint'), icon: 'offline', tone: 'warn', onPress: () => go('edicion') },
      ],
    },
    {
      key: 'devices',
      title: t('mobile.settings.g.devices'),
      rows: [
        { id: 'pair', label: t('sync.pair.start'), sub: t('mobile.settings.noDevices'), icon: 'device', tone: 'acc', onPress: () => go('emparejar') },
        { id: 'history', label: t('history.title'), icon: 'history', onPress: () => go('historial') },
      ],
    },
    {
      key: 'about',
      title: t('mobile.settings.g.about'),
      rows: [{ id: 'version', label: t('app.name'), sub: t('mobile.settings.aboutSub'), icon: 'info' }],
    },
    {
      key: 'danger',
      title: t('mobile.settings.g.danger'),
      danger: true,
      rows: [
        { id: 'clear-history', label: t('mobile.settings.r.clearHistory'), icon: 'trash', onPress: () => setDanger('history') },
        { id: 'forget', label: t('mobile.settings.r.forget'), icon: 'device', onPress: () => setDanger('forget') },
        { id: 'clear-keys', label: t('mobile.settings.r.clearKeys'), icon: 'key', onPress: () => setDanger('keys') },
      ],
    },
  ];
  const needle = q.trim().toLocaleLowerCase(locale);
  const visible = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !needle || `${r.label} ${r.sub ?? ''}`.toLocaleLowerCase(locale).includes(needle)) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div>
      <h1 className="m-large">{t('settings.title')}</h1>
      <label className="m-search">
        <IconSearch />
        <span className="m-sr">{t('mobile.settings.search')}</span>
        <input type="search" placeholder={t('mobile.settings.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {!needle ? (
        <button
          type="button"
          className="m-tap"
          onClick={() => go('proveedor')}
          style={{ display: 'grid', gap: 8, margin: '16px 16px 0', padding: 18, width: 'calc(100% - 32px)', borderRadius: 20, background: 'var(--np-ink)', color: 'var(--np-on-ink)', textAlign: 'left' }}
        >
          <span className="m-kicker" style={{ color: 'var(--np-on-ink)', opacity: 0.7 }}>{t('mobile.settings.summary.title')}</span>
          <span style={{ font: '500 20px/1.25 var(--np-font-read)' }}>{t('mobile.settings.summary.none')}</span>
          <span style={{ font: '400 13px/1.4 var(--np-font-ui)', opacity: 0.75 }}>{t('mobile.settings.summary.sub')}</span>
        </button>
      ) : null}

      {visible.length === 0 ? <p className="m-empty">{t('mobile.settings.noResults')}</p> : null}
      {visible.map((g) => (
        <section key={g.key}>
          <h2 className="m-sec">{g.title}</h2>
          {g.key === 'privacy' && !needle ? <ConnectionCard /> : null}
          <div className={`m-group${g.danger ? ' m-group-danger' : ''}`} style={g.key === 'privacy' && !needle ? { marginTop: 10 } : undefined}>
            {g.rows.map((r) => {
              const body = (
                <>
                  <span className={`m-ico ${r.tone ?? ''}`}>
                    <RowIcon name={r.icon} />
                  </span>
                  <span className="m-row-body">
                    <b>{r.label}</b>
                    {r.sub ? <span>{r.sub}</span> : null}
                  </span>
                  {r.value ? <span className="m-val">{r.value}</span> : null}
                  {r.control ?? (r.onPress ? <IconChevron /> : null)}
                </>
              );
              // Una fila sin acción (p. ej. la versión) es información, no un botón apagado.
              return r.onPress && !r.disabled ? (
                <button key={r.id} type="button" className="m-row" onClick={r.onPress}>{body}</button>
              ) : (
                <div key={r.id} className="m-row" aria-disabled={r.disabled || undefined}>{body}</div>
              );
            })}
          </div>
        </section>
      ))}

      {!needle ? (
        <>
          <h2 className="m-sec">{t('mobile.settings.g.appearance')}</h2>
          <div className="m-seg" role="group" aria-label={t('settings.general.theme')}>
            {(['paper', 'ink', 'system'] as const).map((c) => (
              <button key={c} type="button" aria-pressed={theme === c} onClick={() => pick(c)}>
                {t(`settings.general.theme${c === 'paper' ? 'Paper' : c === 'ink' ? 'Ink' : 'System'}`)}
              </button>
            ))}
          </div>
          <h2 className="m-sec">{t('settings.general.language')}</h2>
          <div className="m-seg" role="group" aria-label={t('settings.general.language')}>
            {(['es', 'en', 'de'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)}>
                {t(`settings.language.${l}`)}
              </button>
            ))}
          </div>
          <div className="m-group" style={{ marginTop: 14 }}>
            <div className="m-row">
              <span className="m-row-body">
                <b>{t('mobile.settings.r.reduceMotion')}</b>
                <span>{sysReduce ? t('mobile.settings.reduceMotionSystem') : t('mobile.settings.r.reduceMotionSub')}</span>
              </span>
              <Switch checked={reduce || sysReduce} label={t('mobile.settings.r.reduceMotion')} onChange={(v) => { setReduce(v); void setMotion(v); }} />
            </div>
          </div>
        </>
      ) : null}
      {danger ? (
        <ConfirmSheet
          title={t(`mobile.settings.${danger === 'history' ? 'history' : danger === 'forget' ? 'forget' : 'keys'}Title`)}
          body={t(`mobile.settings.${danger === 'history' ? 'history' : danger === 'forget' ? 'forget' : 'keys'}Body`)}
          confirm={t('mobile.settings.confirmDo')}
          busy={busy}
          onConfirm={() => void runDanger(danger)}
          onCancel={() => setDanger(null)}
        />
      ) : null}
      <Toast text={toast} />
    </div>
  );
}
