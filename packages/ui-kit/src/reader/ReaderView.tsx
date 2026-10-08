import { useMemo, type MouseEvent, type ReactNode } from 'react';
import type { Article } from '@newpaper/extract';
import { sanitizeArticleHtml } from './sanitize';

/** Texto plano que queda tras sanear: si está vacío, no hay nada que leer. */
const hasReadableText = (html: string) => html.replace(/<[^>]*>/g, '').trim().length > 0;
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
      {readable ? (
        // El HTML ya está saneado con DOMPurify (spec §11).
        <div className="np-reader-body" data-dropcap={dropCap ? 'true' : 'false'} onClick={onClick} dangerouslySetInnerHTML={{ __html: body }} />
      ) : (
        props.empty ?? null
      )}
      {props.children}
    </article>
  );
}
