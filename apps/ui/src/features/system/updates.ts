import { commands } from '../../ipc/commands';
import { onContentApplied, onOpenUrl } from '../../ipc/events';
import { createStore } from '../../state/store';
import { resetPipeline, resetRegistry } from '../ai/pipeline';
import { clearPartiesCache } from '../analysis/parties';

export const systemStore = createStore<{ rolledBackFrom: string | null; whatsNew: { version: string; notes: string } | null }>({ rolledBackFrom: null, whatsNew: null });

const open = (url: string) => void commands.tabOpen({ url, activate: true });

let bridgeStarted = false;

/** Arranque del puente con el sistema: URL pendientes, novedades y recarga de cachés tras contenido nuevo. */
export async function startSystemBridge(): Promise<void> {
  if (bridgeStarted) return;
  bridgeStarted = true;
  await onOpenUrl(open);
  await onContentApplied(() => {
    resetRegistry();
    resetPipeline();
    clearPartiesCache();
  });
  const ready = await commands.appReady();
  ready.pendingUrls.forEach(open);
  const info = await commands.updateStatus();
  systemStore.set({ rolledBackFrom: ready.rolledBackFrom, whatsNew: info.whatsNew });
}
