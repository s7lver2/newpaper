import type { AgentMode } from '@newpaper/pipeline';
import type { TabId } from '../../../ipc/types';
import { createStore } from '../../../state/store';
import { getPipeline } from '../../ai/pipeline';
import { analysisStore, latestResult } from '../controller';
import { applyAgentEvent, type AgentMessage } from './citations';

interface Thread { url: string; messages: AgentMessage[]; busy: boolean }
export const agentStore = createStore<{ byTab: Record<number, Thread> }>({ byTab: {} });
const runs = new Map<TabId, AbortController>();
let seq = 0;

function update(tabId: TabId, f: (t: Thread) => Thread) {
  agentStore.set((s) => {
    const cur = s.byTab[tabId];
    return cur ? { byTab: { ...s.byTab, [tabId]: f(cur) } } : s;
  });
}

export async function sendToAgent(tabId: TabId, question: string, mode: AgentMode, fragment: string | null): Promise<void> {
  const a = analysisStore.get().byTab[tabId];
  if (!a) return;
  const prev = agentStore.get().byTab[tabId];
  const thread: Thread = prev && prev.url === a.url ? prev : { url: a.url, messages: [], busy: false };
  const user: AgentMessage = { id: `u${++seq}`, role: 'user', mode, text: question, fragment, citations: [], visuals: [], media: [], steps: [], done: true, error: null };
  const reply: AgentMessage = { id: `a${++seq}`, role: 'assistant', mode, text: '', fragment: null, citations: [], visuals: [], media: [], steps: [], done: false, error: null };
  agentStore.set((s) => ({ byTab: { ...s.byTab, [tabId]: { ...thread, busy: true, messages: [...thread.messages, user, reply] } } }));
  runs.get(tabId)?.abort();
  const ac = new AbortController();
  runs.set(tabId, ac);
  const patchReply = (f: (m: AgentMessage) => AgentMessage) => update(tabId, (t) => ({ ...t, messages: t.messages.map((m) => (m.id === reply.id ? f(m) : m)) }));
  try {
    const p = await getPipeline();
    await p.askAgent({
      article: a.article,
      previous: latestResult(a),
      mode,
      question,
      fragment: fragment ?? undefined,
      history: thread.messages.filter((m) => m.done && !m.error).map((m) => ({ role: m.role, content: m.text })),
      onEvent: (e) => patchReply((m) => applyAgentEvent(m, e)),
      signal: ac.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    patchReply((m) => (m.done ? m : { ...m, done: true, error: msg }));
  } finally {
    if (runs.get(tabId) === ac) runs.delete(tabId);
    update(tabId, (t) => ({ ...t, busy: false }));
  }
}

export function stopAgent(tabId: TabId): void {
  runs.get(tabId)?.abort();
}

export function useAgent(tabId: TabId) {
  const thread = agentStore.use((s) => s.byTab[tabId]);
  const url = analysisStore.use((s) => s.byTab[tabId]?.url);
  const current = thread && thread.url === url ? thread : undefined;
  return {
    messages: current?.messages ?? [],
    busy: current?.busy ?? false,
    send: (q: string, mode: AgentMode, fragment: string | null) => sendToAgent(tabId, q, mode, fragment),
    stop: () => stopAgent(tabId),
  };
}
