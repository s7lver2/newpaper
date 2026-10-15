import { describe, expect, it } from 'vitest';
import { applyAgentEvent, renderCitations, type AgentMessage } from './citations';

const cite = { n: 1, sourceId: 'S1', title: 'Eurostat', url: 'https://ec.europa.eu/x' };

describe('renderCitations', () => {
  it('maps known markers to sources and drops unknown ones', () => {
    const parts = renderCitations('España es sexta [1]. Otro dato [7]. Lista [a].', [cite]);
    expect(parts).toEqual([
      { kind: 'text', text: 'España es sexta ' },
      { kind: 'cite', n: 1, citation: cite },
      { kind: 'text', text: '. Otro dato. Lista [a].' },
    ]);
  });
});

describe('applyAgentEvent', () => {
  const empty: AgentMessage = { id: 'm', role: 'assistant', mode: 'verify', text: '', fragment: null, citations: [], visuals: [], media: [], steps: [], done: false, error: null };
  it('streams text, collects tools, visuals and media, and the final text replaces the stream', () => {
    let m = applyAgentEvent(empty, { type: 'text', delta: 'Hola [1] [9]' });
    m = applyAgentEvent(m, { type: 'step', tool: 'renderVisualization' });
    m = applyAgentEvent(m, { type: 'visualization', viz: { type: 'bar', title: 'B', sourceIds: ['S1'], data: { points: [{ x: 'a', y: 1 }] } } });
    m = applyAgentEvent(m, { type: 'media', media: { kind: 'image', url: 'https://ec.europa.eu/c.png', sourceId: 'S1', caption: 'c' } });
    m = applyAgentEvent(m, { type: 'done', text: 'Hola [1]', citations: [cite] });
    expect(m).toMatchObject({ text: 'Hola [1]', done: true, steps: ['renderVisualization'], citations: [cite] });
    expect(m.visuals).toHaveLength(1);
    expect(m.media).toHaveLength(1);
    expect(applyAgentEvent(m, { type: 'error', message: 'x' }).error).toBe('x');
  });
});
