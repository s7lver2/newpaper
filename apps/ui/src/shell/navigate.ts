import { commands } from '../ipc/commands';
import { browserStore } from '../state/browser';
import { formatInternalUrl } from './internalUrl';

export async function navigate(input: string, opts: { newTab?: boolean; private?: boolean } = {}): Promise<void> {
  const active = browserStore.get().snapshot.activeId;
  if (opts.newTab || opts.private || active === null) {
    await commands.tabOpen({ url: input, private: opts.private ?? false });
    return;
  }
  await commands.tabNavigate(active, input);
}

export function openInternal(page: string, path: string[] = [], query?: Record<string, string>, opts?: { newTab?: boolean }) {
  return navigate(formatInternalUrl(page, path, query), opts);
}
