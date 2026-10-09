import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from 'react';
import type { Article } from '@newpaper/extract';
import { sanitizeArticleHtml } from './sanitize';

/** Texto plano que queda tras sanear: si está vacío, no hay nada que leer. */
const hasReadableText = (html: string) => html.replace(/<[^>]*>/g, '').trim().length > 0;
/** Reintentos de una imagen que falla (circuitos de Tor lentos, CDN con fallos puntuales). */
const IMAGE_RETRIES = 2;

/**
 * Clasifica la imagen por su tamaño real: retratos y avatares (pequeños) se dibujan redondos y chicos,
 * las fotos anchas ocupan la columna y el resto conserva su tamaño natural.
 */
export function classifyImage(img: HTMLImageElement): void {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return;
  const attrW = Number(img.getAttribute('width')) || 0;
  let size = 'normal';
  if (w <= 2 && h <= 2) size = 'pixel';
  else if (Math.max(w, h) <= 240 || (attrW > 0 && attrW <= 160)) size = 'avatar';
  else if (w >= 560 && w >= h * 1.15) size = 'wide';
  img.dataset.npSize = size;
}

const head = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 48).toLowerCase();

export function ReaderView(props: {
  article: Article;
  meta?: ReactNode;
  /** Antetítulo (medio): se pinta sobre el titular. */
  kicker?: ReactNode;
  /** Entradilla; se omite si ya abre el cuerpo del artículo. */
  deck?: string | null;
  rewriteImage(absUrl: string): string | null;
  onOpenLink?(url: string): void;
  /** Se pinta en lugar del cuerpo cuando la extracción no dejó texto legible. */
  empty?: ReactNode;
  /** Aviso entre la cabecera y el cuerpo (p. ej. artículo limitado por suscripción). */
  notice?: ReactNode;
  children?: ReactNode;
}) {
  const { article, rewriteImage, onOpenLink } = props;
  const body = useMemo(() => sanitizeArticleHtml(article.html, { rewriteImage }), [article.html, rewriteImage]);
  const readable = hasReadableText(body);
  const deck = useMemo(() => {
    const d = props.deck?.trim();
    if (!d) return null;
    return head(article.text) === head(d) ? null : d;
  }, [props.deck, article.text]);
  // Capitular solo si el cuerpo abre con un párrafo que empieza por una letra.
  const dropCap = useMemo(() => /^\p{L}/u.test(article.text.trim()) && /^\s*<p[ >]/i.test(body), [article.text, body]);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onLoad = (e: Event) => {
      if (e.target instanceof HTMLImageElement) classifyImage(e.target);
    };
    const onError = (e: Event) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      const tries = Number(img.dataset.npTries ?? 0);
      if (tries >= IMAGE_RETRIES) {
        img.dataset.npFailed = 'true';
        return;
      }
      img.dataset.npTries = String(tries + 1);
      window.setTimeout(() => {
        try {
          const u = new URL(img.src);
          u.searchParams.set('n', String(tries + 1));
          img.src = u.toString();
        } catch {
          img.dataset.npFailed = 'true';
        }
      }, 900 * (tries + 1));
    };
    // `load` y `error` no burbujean: se escuchan en captura.
    el.addEventListener('load', onLoad, true);
    el.addEventListener('error', onError, true);
    el.querySelectorAll('img').forEach((i) => i.complete && classifyImage(i));
    return () => {
      el.removeEventListener('load', onLoad, true);
      el.removeEventListener('error', onError, true);
    };
  }, [body, readable]);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest('a[href]');
    if (!a) return;
    e.preventDefault();
    onOpenLink?.(a.getAttribute('href')!);
  };
  return (
    <article className="np-reader np-rise" lang={article.lang ?? undefined}>
      <header className="np-reader-head">
        {props.kicker ? <div className="np-reader-kicker">{props.kicker}</div> : null}
        <h1 className="np-reader-title">{article.title}</h1>
        {deck ? <p className="np-reader-deck">{deck}</p> : null}
        {props.meta ? <div className="np-reader-meta">{props.meta}</div> : null}
      </header>
      {props.notice}
      {readable ? (
        // El HTML ya está saneado con DOMPurify (spec §11).
        <div className="np-reader-body" ref={bodyRef} data-dropcap={dropCap ? 'true' : 'false'} onClick={onClick} dangerouslySetInnerHTML={{ __html: body }} />
      ) : (
        props.empty ?? null
      )}
      {props.children}
    </article>
  );
}
