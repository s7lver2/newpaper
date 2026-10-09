import type { PartyInfo } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';

const cache = new Map<string, Promise<PartyInfo[]>>();

export function loadParties(locale: string): Promise<PartyInfo[]> {
  let p = cache.get(locale);
  if (!p) {
    p = commands
      .configRead(`parties-${locale}.json`)
      .then((txt) => (JSON.parse(txt) as { parties: PartyInfo[] }).parties)
      .catch(() => []);
    cache.set(locale, p);
  }
  return p;
}

export function useParties(): PartyInfo[] {
  const [parties, setParties] = useState<PartyInfo[]>([]);
  useEffect(() => {
    let alive = true;
    void commands.settingsGet<string>('content.locale').then((l) => loadParties(l ?? 'es')).then((p) => alive && setParties(p));
    return () => {
      alive = false;
    };
  }, []);
  return parties;
}
