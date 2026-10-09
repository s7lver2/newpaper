import { extractFromHtml, type Article } from '@newpaper/extract';
import { convertFileSrc } from '@tauri-apps/api/core';
import { commands } from '../../ipc/commands';
import type { BeginResult } from '../../ipc/types';
import { compressImage } from './compressImage';
import { getOfflineAnalyzer } from './offlineAnalyzer';

export interface EditionDeps {
  begin(date: string): Promise<BeginResult>;
  fetchHtml(url: string): Promise<string>;
  extract(html: string, url: string): Article | null;
  compress(absUrl: string): Promise<{ data: string; bytes: number } | null>;
  saveImage(editionId: string, name: string, data: string): Promise<string>;
  addArticle(a: { editionId: string; url: string; title: string; outlet: string | null; articleJson: string; analysisJson: string | null }): Promise<void>;
  finish(editionId: string, summaryJson: string, date: string): Promise<unknown>;
  analyze?: (a: Article) => Promise<unknown>;
}

export function realEditionDeps(): EditionDeps {
  return {
    begin: commands.offlineBegin,
    fetchHtml: commands.offlineFetchHtml,
    extract: extractFromHtml,
    compress: compressImage,
    saveImage: commands.offlineSaveImage,
    addArticle: commands.offlineAddArticle,
    finish: commands.offlineFinish,
    analyze: getOfflineAnalyzer() ?? undefined,
  };
}

const localUrl = (path: string) => convertFileSrc(path, 'npoffline');

/** `index` distingue los ficheros de los artículos de una misma edición (comparten carpeta). */
export async function localizeImages(article: Article, editionId: string, index: number, deps: EditionDeps): Promise<Article> {
  const tpl = document.createElement('template');
  tpl.innerHTML = article.html;
  let n = 0;
  for (const img of Array.from(tpl.content.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    const c = /^https?:\/\//.test(src) ? await deps.compress(src) : null;
    if (!c) {
      img.remove();
      continue;
    }
    const path = await deps.saveImage(editionId, `${index}-${n++}.webp`, c.data);
    img.setAttribute('src', localUrl(path));
    img.removeAttribute('srcset');
  }
  return { ...article, html: tpl.innerHTML };
}

export async function buildEdition(date: string, deps: EditionDeps, onProgress?: (done: number, total: number) => void) {
  const { editionId, candidates, summaryJson } = await deps.begin(date);
  let count = 0;
  for (const [i, c] of candidates.entries()) {
    try {
      const extracted = deps.extract(await deps.fetchHtml(c.url), c.url);
      if (extracted) {
        const article = await localizeImages(extracted, editionId, i, deps);
        const analysis = deps.analyze ? await deps.analyze(article).catch(() => null) : null;
        await deps.addArticle({
          editionId, url: c.url, title: article.title || c.title, outlet: c.outlet,
          articleJson: JSON.stringify(article), analysisJson: analysis === null ? null : JSON.stringify(analysis),
        });
        count++;
      }
    } catch {
      /* el artículo falla (red, extracción): se sigue con el resto */
    }
    onProgress?.(i + 1, candidates.length);
  }
  await deps.finish(editionId, summaryJson, date);
  return { editionId, count };
}
