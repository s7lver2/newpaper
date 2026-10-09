import { setOfflineAnalyzer } from '../sources/offlineAnalyzer';
import { getPipeline } from './pipeline';

// La edición sin conexión (subproyecto 3) guarda el análisis rápido de cada artículo.
setOfflineAnalyzer(async (a) => {
  const p = await getPipeline();
  return p.runQuickAnalysis({ url: a.url, title: a.title, text: a.text, lang: a.lang, siteName: a.siteName, byline: a.byline, published: a.published });
});
