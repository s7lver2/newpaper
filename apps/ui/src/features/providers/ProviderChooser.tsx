import { useI18n } from '@newpaper/i18n/react';
import type { ProviderEntry, Registry } from '@newpaper/pipeline';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { WIZARD_NAME } from './aiModel';
import { chooserRows, SEGMENTS, tagsOf, type Segment } from './chooser';
import { ProviderLogo } from './ProviderLogo';

const Chevron = () => (
  <svg className="np-wz-row-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
);

interface Props {
  registry: Registry;
  /** Modelos que Ollama / LM Studio tienen cargados ahora (`null` si no están en marcha). */
  localModels(p: ProviderEntry): string[] | null;
  onPick(p: ProviderEntry): void;
  onBack(): void;
}

/**
 * La lista completa de proveedores: un buscador, un interruptor de tres posiciones y filas sencillas.
 * Teclado: Tab salta de bloque en bloque (volver, buscar, interruptor, lista, avanzado); las flechas se mueven dentro
 * del interruptor y de la lista; Escape lo gestiona el asistente (un nivel atrás).
 */
export function ProviderChooser({ registry, localModels, onPick, onBack }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<Segment>('open');
  const [active, setActive] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const segRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    search.current?.focus({ preventScroll: true });
  }, []);

  const name = (p: ProviderEntry) => WIZARD_NAME[p.id] ?? p.name;
  const searching = query.trim().length > 0;
  const rows = chooserRows(registry.providers, { query, segment, nameOf: name });
  const custom = registry.providers.find((p) => p.category === 'advanced');
  const soon = registry.roadmap;
  // Lo que viene después no se esconde al buscar «router», pero tampoco ocupa sitio al buscar otra cosa.
  const q = query.trim().toLowerCase();
  const soonShown = soon.filter((r) => !q || r.name.toLowerCase().includes(q));
  const at = Math.min(active, Math.max(rows.length - 1, 0));
  const count = (n: number) => t('providers.all.count', { n });

  const focusRow = (i: number) => {
    const j = Math.max(0, Math.min(rows.length - 1, i));
    setActive(j);
    rowRefs.current[j]?.focus();
  };
  const onRowKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown') focusRow(i + 1);
    else if (e.key === 'ArrowUp') {
      if (i === 0) search.current?.focus();
      else focusRow(i - 1);
    } else if (e.key === 'Home') focusRow(0);
    else if (e.key === 'End') focusRow(rows.length - 1);
    else return;
    e.preventDefault();
  };
  const onSegKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + SEGMENTS.length) % SEGMENTS.length;
    setSegment(SEGMENTS[next]!);
    setActive(0);
    segRefs.current[next]?.focus();
  };

  return (
    <div className="np-wz-all">
      <button type="button" className="np-wz-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        {t('providers.all.back')}
      </button>
      <h2 className="np-wz-all-title">{t('providers.all.title')}</h2>

      <div className="np-wz-find">
        <input
          ref={search}
          className="np-wz-input np-wz-input--find"
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={t('providers.all.search')}
          aria-label={t('providers.all.search')}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && rows.length) {
              e.preventDefault();
              focusRow(0);
            } else if (e.key === 'Escape' && query) {
              // Primero se vacía la búsqueda; el segundo Escape vuelve atrás.
              e.preventDefault();
              e.stopPropagation();
              setQuery('');
            }
          }}
        />
        <div className="np-wz-seg" role="radiogroup" aria-label={t('providers.all.segments')} data-idle={searching}>
          {SEGMENTS.map((s, i) => (
            <button
              key={s}
              ref={(el) => {
                segRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={segment === s}
              tabIndex={segment === s ? 0 : -1}
              className="np-wz-seg-btn"
              onClick={() => {
                setSegment(s);
                setActive(0);
              }}
              onKeyDown={(e) => onSegKey(e, i)}
            >
              {t(`providers.cat.${s}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="np-wz-seg-hint" aria-live="polite">{searching ? count(rows.length) : t(`providers.cat.${segment}Hint`)}</p>

      <ul className="np-wz-rows" aria-label={t('providers.all.title')}>
        {soonShown.map((r) => (
          <li key={r.id}>
            <button type="button" className="np-wz-row np-wz-row--soon" disabled aria-describedby={`np-wz-soon-${r.id}`}>
              <ProviderLogo id={r.id} size={36} radius={10} mark={20} mono={13} />
              <span className="np-wz-row-text">
                <span className="np-wz-row-name">{r.name}</span>
                <span id={`np-wz-soon-${r.id}`} className="np-wz-row-hint np-wz-row-hint--wrap">{t(`providers.soon.${r.id}`)}</span>
              </span>
              <span className="np-wz-badge">{t('providers.soon.badge')}</span>
            </button>
          </li>
        ))}
        {rows.map((p, i) => {
          const found = localModels(p);
          const tags = tagsOf(p);
          return (
            <li key={p.id}>
              <button
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                type="button"
                className="np-wz-row"
                tabIndex={i === at ? 0 : -1}
                onFocus={() => setActive(i)}
                onKeyDown={(e) => onRowKey(e, i)}
                onClick={() => onPick(p)}
              >
                <ProviderLogo id={p.id} size={36} radius={10} mark={20} mono={13} />
                <span className="np-wz-row-text">
                  <span className="np-wz-row-name">{name(p)}</span>
                  <span className="np-wz-row-hint">{found?.length ? found.slice(0, 3).map((m) => registry.model(p.id, m)?.name ?? m).join(' · ') : t(`providers.hint.${p.id}`)}</span>
                </span>
                <span className="np-wz-tags">
                  {found?.length ? <span className="np-wz-tag np-wz-tag--ok">{t('providers.pill.detected')}</span> : null}
                  {tags.map((g) => <span key={g} className="np-wz-tag">{t(`providers.tag.${g}`)}</span>)}
                </span>
                <Chevron />
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 ? <p className="np-wz-none" role="status">{t('providers.all.none', { query: query.trim() })}</p> : null}

      {custom ? (
        <button type="button" className="np-wz-custom" onClick={() => onPick(custom)}>
          {t('providers.all.custom')}
          <Chevron />
        </button>
      ) : null}
    </div>
  );
}
