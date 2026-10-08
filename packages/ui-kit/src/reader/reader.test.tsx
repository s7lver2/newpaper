import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Article } from '@newpaper/extract';
import { ReaderView } from './ReaderView';
import { sanitizeArticleHtml } from './sanitize';

const proxy = (u: string) => `http://npimg.localhost/${encodeURIComponent(u)}`;

describe('sanitizeArticleHtml', () => {
  it('removes active content and dangerous attributes', () => {
    const out = sanitizeArticleHtml(
      '<p style="color:red" onclick="x()">Hola<script>alert(1)</script></p><iframe src="https://e.x"></iframe><form><input></form><a href="javascript:alert(1)">mal</a>',
      { rewriteImage: proxy },
    );
    expect(out).toBe('<p>Hola</p><a>mal</a>');
  });
  it('rewrites images through the proxy and drops srcset', () => {
    const out = sanitizeArticleHtml('<img src="https://cdn.example/a.jpg" srcset="b.jpg 2x" alt="A">', { rewriteImage: proxy });
    expect(out).toBe('<img src="http://npimg.localhost/https%3A%2F%2Fcdn.example%2Fa.jpg" alt="A" loading="lazy">');
  });
  it('drops images whose URL is rejected', () => {
    expect(sanitizeArticleHtml('<img src="data:image/png;base64,AA">', { rewriteImage: () => null })).toBe('');
  });
  it('keeps safe links with rel noopener', () => {
    expect(sanitizeArticleHtml('<a href="https://boe.es/x">BOE</a>', { rewriteImage: proxy })).toBe(
      '<a href="https://boe.es/x" rel="noopener noreferrer">BOE</a>',
    );
  });
});

describe('ReaderView', () => {
  const article: Article = {
    url: 'https://d.example/a', title: 'Titular', byline: 'Ana', siteName: 'Diario', published: null, lang: 'es',
    html: '<p>Cuerpo <a href="https://d.example/b">enlace</a></p><script>x</script>', text: 'Cuerpo enlace', excerpt: null,
  };
  it('renders the sanitized article and intercepts links', async () => {
    const onOpenLink = vi.fn();
    render(<ReaderView article={article} meta={<span>meta</span>} rewriteImage={proxy} onOpenLink={onOpenLink} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Titular' })).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'es');
    expect(document.querySelector('script')).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'enlace' }));
    expect(onOpenLink).toHaveBeenCalledWith('https://d.example/b');
  });
});
