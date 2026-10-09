// Uso: node scripts/check-feeds.mjs config/sources-es.json
import { readFile } from 'node:fs/promises';

export function classify(status, body) {
  if (status !== 200) return `http-${status}`;
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(body) && /<(item|entry)[\s>/]/i.test(body) ? 'ok' : 'not-a-feed';
}

async function main(path) {
  const { medios } = JSON.parse(await readFile(path, 'utf8'));
  let bad = 0;
  for (const m of medios) {
    for (const url of m.feeds) {
      let result;
      try {
        const r = await fetch(url, { headers: { 'user-agent': 'newpaper-feed-check' }, signal: AbortSignal.timeout(15000) });
        result = classify(r.status, await r.text());
      } catch (e) {
        result = `error ${e.name}`;
      }
      if (result !== 'ok') bad++;
      console.log(`${result.padEnd(12)} ${m.id.padEnd(16)} ${url}`);
    }
  }
  console.log(bad ? `${bad} feeds need fixing` : 'all feeds ok');
  process.exitCode = bad ? 1 : 0;
}

if (process.argv[2]) await main(process.argv[2]);
