import { useI18n } from '@newpaper/i18n/react';
import type { ThemeChoice } from '@newpaper/ui-kit';
import { useEffect, useState, type ReactNode } from 'react';
import { IconChevron, IconSearch, RowIcon } from '../icons';
import { ipc } from '../ipc';
import { go } from '../router';
import { setThemeChoice } from '../theme';
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

/** Ajustes del móvil: búsqueda, resumen de IA, grupos con cabecera, subpantallas y zona de peligro. La red es directa (Tor no está en Android). */
export function Settings() {
  const { t, locale, setLocale } = useI18n();
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState<ThemeChoice>('system');
  useEffect(() => {
    void ipc.settingsGet<string>('device.theme').then((v) => setTheme(v === 'paper' || v === 'ink' ? v : 'system')).catch(() => {});
  }, []);
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
        { id: 'pipeline', label: t('mobile.settings.r.pipeline'), sub: soon, icon: 'pipe', tone: 'acc', disabled: true },
      ],
    },
    {
      key: 'privacy',
      title: t('mobile.settings.g.privacy'),
      rows: [],
    },
    {
      key: 'content',
      title: t('mobile.settings.g.content'),
      rows: [{ id: 'offline', label: t('mobile.edition.title'), sub: t('mobile.edition.hint'), icon: 'offline', tone: 'warn', onPress: () => go('edicion') }],
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
        { id: 'clear-history', label: t('mobile.settings.r.clearHistory'), sub: soon, icon: 'trash', disabled: true },
        { id: 'forget', label: t('mobile.settings.r.forget'), sub: soon, icon: 'device', disabled: true },
        { id: 'clear-keys', label: t('mobile.settings.r.clearKeys'), sub: soon, icon: 'key', disabled: true },
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

      {!needle ? (
        <section>
          <h2 className="m-sec">{t('mobile.settings.g.privacy')}</h2>
          <ConnectionCard />
        </section>
      ) : null}
      {visible.length === 0 ? <p className="m-empty">{t('mobile.settings.noResults')}</p> : null}
      {visible.map((g) => (
        <section key={g.key}>
          <h2 className="m-sec">{g.title}</h2>
          <div className={`m-group${g.danger ? ' m-group-danger' : ''}`}>
            {g.rows.map((r) => (
              <button key={r.id} type="button" className="m-row" disabled={r.disabled || (!r.onPress && !r.control)} onClick={r.onPress}>
                <span className={`m-ico ${r.tone ?? ''}`}>
                  <RowIcon name={r.icon} />
                </span>
                <span className="m-row-body">
                  <b>{r.label}</b>
                  {r.sub ? <span>{r.sub}</span> : null}
                </span>
                {r.value ? <span className="m-val">{r.value}</span> : null}
                {r.control ?? (r.onPress ? <IconChevron /> : null)}
              </button>
            ))}
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
          <p className="m-note">{t('mobile.settings.dangerNote')}</p>
        </>
      ) : null}
    </div>
  );
}
