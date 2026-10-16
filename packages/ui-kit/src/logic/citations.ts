import type { AgentCitation, AgentEvent, AgentMode, MediaItem, Visualization } from '@newpaper/pipeline';

export type CitedPart = { kind: 'text'; text: string } | { kind: 'cite'; n: number; citation: AgentCitation };

export function renderCitations(text: string, citations: AgentCitation[]): CitedPart[] {
  const byN = new Map(citations.map((c) => [c.n, c]));
  const parts: CitedPart[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = parts.at(-1);
    if (last?.kind === 'text') last.text += t;
    else parts.push({ kind: 'text', text: t });
  };
  let i = 0;
  for (const m of text.matchAll(/\s*\[(\d+)\]/g)) {
    const at = m.index!;
    const c = byN.get(Number(m[1]));
    pushText(text.slice(i, at));
    if (c) {
      pushText(m[0].slice(0, m[0].indexOf('[')));
      parts.push({ kind: 'cite', n: c.n, citation: c });
    }
    i = at + m[0].length;
  }
  pushText(text.slice(i));
  return parts;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  mode: AgentMode;
  text: string;
  fragment: string | null;
  citations: AgentCitation[];
  visuals: Visualization[];
  media: MediaItem[];
  steps: string[];
  done: boolean;
  error: string | null;
  /** Aviso transitorio (p. ej. «reintentando sin herramientas»). */
  retry?: 'tools' | 'stream' | null;
}

export function applyAgentEvent(m: AgentMessage, e: AgentEvent): AgentMessage {
  switch (e.type) {
    case 'text':
      return { ...m, text: m.text + e.delta };
    case 'step':
      return { ...m, steps: [...m.steps, e.tool] };
    case 'visualization':
      return { ...m, visuals: [...m.visuals, e.viz] };
    case 'media':
      return { ...m, media: [...m.media, e.media] };
    case 'retry':
      return { ...m, text: '', steps: [], retry: e.reason };
    case 'done':
      return { ...m, text: e.text, citations: e.citations, done: true };
    case 'error':
      return { ...m, error: e.message, done: true };
  }
}
