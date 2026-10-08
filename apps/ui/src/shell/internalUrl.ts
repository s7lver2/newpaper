export interface InternalUrl {
  page: string;
  path: string[];
  query: URLSearchParams;
}

const PREFIX = 'newpaper://';

export function parseInternalUrl(url: string): InternalUrl | null {
  if (url.slice(0, PREFIX.length).toLowerCase() !== PREFIX) return null;
  const rest = url.slice(PREFIX.length);
  const qi = rest.indexOf('?');
  const pathPart = qi >= 0 ? rest.slice(0, qi) : rest;
  const query = new URLSearchParams(qi >= 0 ? rest.slice(qi + 1) : '');
  const [page = '', ...path] = pathPart.split('/');
  return { page: page.toLowerCase(), path: path.filter((p) => p !== '').map(decodeURIComponent), query };
}

export function formatInternalUrl(page: string, path: string[] = [], query?: Record<string, string>): string {
  const p = [page, ...path.map(encodeURIComponent)].join('/');
  const q = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : '';
  return `${PREFIX}${p}${q}`;
}
