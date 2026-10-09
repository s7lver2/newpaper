import type { Article } from '@newpaper/extract';

let analyzer: ((a: Article) => Promise<unknown>) | null = null;

/** El subproyecto 4 registra aquí el análisis rápido que se guarda con cada artículo de la edición. */
export function setOfflineAnalyzer(fn: ((a: Article) => Promise<unknown>) | null): void {
  analyzer = fn;
}

export const getOfflineAnalyzer = () => analyzer;
