import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

export const USAGE = {
  inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 50, text: 50, reasoning: undefined },
};

const gen = (text: string) => ({ content: [{ type: 'text' as const, text }], finishReason: { unified: 'stop' as const, raw: undefined }, usage: USAGE, warnings: [] });

/** Modelo simulado que devuelve, por orden, cada texto (normalmente JSON) en sucesivas llamadas. */
export function textModel(...outputs: string[]): MockLanguageModelV4 {
  let i = 0;
  return new MockLanguageModelV4({ doGenerate: async () => gen(outputs[Math.min(i++, outputs.length - 1)]!) });
}

export type StreamStep = { toolCalls?: { name: string; input: unknown }[]; text?: string };

/** Modelo en streaming: cada paso emite llamadas a herramientas o texto final. */
export function streamModel(steps: StreamStep[]): MockLanguageModelV4 {
  let n = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(n++, steps.length - 1)]!;
      const chunks: unknown[] = [];
      for (const [i, c] of (step.toolCalls ?? []).entries())
        chunks.push({ type: 'tool-call', toolCallId: `c${n}-${i}`, toolName: c.name, input: JSON.stringify(c.input) });
      if (step.text) chunks.push({ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: step.text }, { type: 'text-end', id: 't' });
      chunks.push({ type: 'finish', finishReason: { unified: step.toolCalls?.length ? 'tool-calls' : 'stop', raw: undefined }, usage: USAGE });
      return { stream: simulateReadableStream({ chunks: chunks as never[], initialDelayInMs: null, chunkDelayInMs: null }) };
    },
  });
}
