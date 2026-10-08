export interface Article {
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  /** ISO 8601 tal como lo publica la página, o null. */
  published: string | null;
  lang: string | null;
  /** HTML de Readability: sin scripts; se sanea de nuevo antes de pintarlo. */
  html: string;
  text: string;
  excerpt: string | null;
}

export interface NewsSignals {
  ogType: string | null;
  jsonLdTypes: string[];
}

export const LIMITS = { html: 1_500_000, text: 1_000_000, title: 1_000, field: 500 } as const;
