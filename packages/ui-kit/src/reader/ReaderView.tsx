import { useMemo, type MouseEvent, type ReactNode } from 'react';
import type { Article } from '@newpaper/extract';
import { sanitizeArticleHtml } from './sanitize';

export function ReaderView(props: {
  article: Article;
  meta?: ReactNode;
  rewriteImage(absUrl: string): string | null;
  onOpenLink?(url: string): void;
  children?: ReactNode;
}) {
  const { article, rewriteImage, onOpenLink } = props;
  const body = useMemo(() => sanitizeArticleHtml(article.html, { rewriteImage }), [article.html, rewriteImage]);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest('a[href]');
    if (!a) return;
    e.preventDefault();
    onOpenLink?.(a.getAttribute('href')!);
  };
  return (
    <article className="np-reader" lang={article.lang ?? undefined}>
      <header className="np-reader-head">
        <h1 className="np-reader-title">{article.title}</h1>
        {props.meta ? <div className="np-reader-meta">{props.meta}</div> : null}
      </header>
      {/* El HTML ya está saneado con DOMPurify (spec §11). */}
      <div className="np-reader-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: body }} />
      {props.children}
    </article>
  );
}
