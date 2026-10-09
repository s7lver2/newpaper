import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'q', 'cite', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark', 'abbr', 'time', 'code', 'pre',
  'a', 'img', 'figure', 'figcaption', 'picture', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'section', 'div', 'span',
];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'datetime', 'colspan', 'rowspan', 'scope', 'lang', 'dir', 'width', 'height'];
/** Marcadores de posición típicos de la carga diferida: no son la imagen. */
const PLACEHOLDER = /(?:^|[/_.-])(?:placeholder|spacer|blank|transparent|pixel|1x1|loader)[\w.-]*\.(?:gif|png|svg|jpe?g|webp)(?:$|[?#])/i;
const DROP = 'data-np-drop';

export function sanitizeArticleHtml(html: string, opts: { rewriteImage(absUrl: string): string | null }): string {
  const purify = DOMPurify(window);
  purify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (!href || !/^https?:\/\//i.test(href)) el.removeAttribute('href');
      else el.setAttribute('rel', 'noopener noreferrer');
    }
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') ?? '';
      for (const dim of ['width', 'height']) {
        const v = el.getAttribute(dim);
        if (v !== null && !/^\d{1,4}$/.test(v.trim())) el.removeAttribute(dim);
      }
      const rewritten = /^https?:\/\//i.test(src) && !PLACEHOLDER.test(src) ? opts.rewriteImage(src) : null;
      if (!rewritten) {
        // No se borra dentro del gancho (DOMPurify está recorriendo el árbol): se marca y se quita después.
        el.setAttribute(DROP, '');
        return;
      }
      el.setAttribute('src', rewritten);
      el.setAttribute('loading', 'lazy');
    }
  });
  const fragment = purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|npimg:)/i,
    RETURN_DOM_FRAGMENT: true,
  });
  purify.removeAllHooks();
  fragment.querySelectorAll(`[${DROP}]`).forEach((n) => n.remove());
  const holder = document.createElement('div');
  holder.append(fragment);
  return holder.innerHTML;
}
