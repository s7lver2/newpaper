import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from 'ai';
import type { z } from 'zod';

export type StageId = 'claims' | 'quickScore' | 'verify' | 'score' | 'judgeB' | 'synthesis' | 'aiDetect' | 'agent' | 'investigate';

export class StageError extends Error {
  constructor(public stage: StageId, public code: 'invalid_output' | 'provider' | 'aborted', message: string) {
    super(message);
    this.name = 'StageError';
  }
}

export interface Usage { inputTokens: number; outputTokens: number }

export async function generateStructured<T>(opts: {
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  stage: StageId;
  temperature?: number;
  noTemperature?: boolean;
  signal?: AbortSignal;
}): Promise<{ object: T; usage: Usage }> {
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const call = async (prompt: string) => {
    const r = await generateText({
      model: opts.model,
      system: opts.system,
      prompt,
      output: Output.object({ schema: opts.schema }),
      temperature: opts.noTemperature ? undefined : opts.temperature,
      abortSignal: opts.signal,
      maxRetries: 1,
    });
    usage.inputTokens += r.usage.inputTokens ?? 0;
    usage.outputTokens += r.usage.outputTokens ?? 0;
    return r.output as T;
  };
  try {
    return { object: await call(opts.prompt), usage };
  } catch (first) {
    if (opts.signal?.aborted) throw new StageError(opts.stage, 'aborted', 'aborted');
    if (!NoObjectGeneratedError.isInstance(first)) throw new StageError(opts.stage, 'provider', first instanceof Error ? first.message : String(first));
    usage.inputTokens += first.usage?.inputTokens ?? 0;
    usage.outputTokens += first.usage?.outputTokens ?? 0;
    const feedback = `${opts.prompt}\n\nYour previous output was invalid (${String(first.cause ?? first.message).slice(0, 400)}). Previous output:\n${(first.text ?? '').slice(0, 2000)}\nReturn only valid JSON that matches the schema.`;
    try {
      return { object: await call(feedback), usage };
    } catch (second) {
      throw new StageError(opts.stage, NoObjectGeneratedError.isInstance(second) ? 'invalid_output' : 'provider', second instanceof Error ? second.message : String(second));
    }
  }
}
