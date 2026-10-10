import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import { describeError } from '../registry/models';

export type StageId = 'claims' | 'quickScore' | 'verify' | 'score' | 'judgeB' | 'synthesis' | 'aiDetect' | 'agent' | 'investigate';

export class StageError extends Error {
  constructor(public stage: StageId, public code: 'invalid_output' | 'provider' | 'aborted', message: string) {
    super(message);
    this.name = 'StageError';
  }
}

export interface Usage { inputTokens: number; outputTokens: number }

/** Saca el primer objeto JSON de un texto libre (valla ```json, bloque <think>, texto alrededor). */
export function extractJson(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = t.search(/[{[]/);
  if (start < 0) throw new Error('no JSON found in the model reply');
  const open = t[start]!;
  const close = open === '{' ? '}' : ']';
  const end = t.lastIndexOf(close);
  if (end <= start) throw new Error('unterminated JSON in the model reply');
  return JSON.parse(t.slice(start, end + 1));
}

async function generateNative<T>(opts: {
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  stage: StageId;
  maxOutputTokens?: number;
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
      // Sin tope, OpenRouter reserva toda la ventana de contexto y responde 402 si el saldo no la cubre.
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
    });
    usage.inputTokens += r.usage.inputTokens ?? 0;
    usage.outputTokens += r.usage.outputTokens ?? 0;
    return r.output as T;
  };
  try {
    return { object: await call(opts.prompt), usage };
  } catch (first) {
    if (opts.signal?.aborted) throw new StageError(opts.stage, 'aborted', 'aborted');
    if (!NoObjectGeneratedError.isInstance(first)) throw new StageError(opts.stage, 'provider', describeError(first));
    usage.inputTokens += first.usage?.inputTokens ?? 0;
    usage.outputTokens += first.usage?.outputTokens ?? 0;
    const feedback = `${opts.prompt}\n\nYour previous output was invalid (${String(first.cause ?? first.message).slice(0, 400)}). Previous output:\n${(first.text ?? '').slice(0, 2000)}\nReturn only valid JSON that matches the schema.`;
    try {
      return { object: await call(feedback), usage };
    } catch (second) {
      throw new StageError(opts.stage, NoObjectGeneratedError.isInstance(second) ? 'invalid_output' : 'provider', describeError(second));
    }
  }
}

/**
 * Salida estructurada con respaldo: muchos endpoints compatibles con OpenAI (p. ej. los gratuitos de NVIDIA NIM) rechazan
 * `response_format` o devuelven JSON roto. Si la vía nativa falla, se pide el JSON como texto normal con el esquema en el
 * prompt y se valida igual con zod.
 */
export async function generateStructured<T>(opts: Parameters<typeof generateNative<T>>[0]): Promise<{ object: T; usage: Usage }> {
  try {
    return await generateNative(opts);
  } catch (native) {
    if (opts.signal?.aborted || !(native instanceof StageError) || native.code === "aborted") throw native;
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    const schemaJson = JSON.stringify(z.toJSONSchema(opts.schema as unknown as z.ZodType));
    const system = `${opts.system}
Reply with ONLY one JSON object (no prose, no markdown fences) that validates against this JSON Schema:
${schemaJson}`;
    let prompt = opts.prompt;
    for (let attempt = 0; attempt < 2; attempt++) {
      let text = "";
      try {
        const r = await generateText({
          model: opts.model,
          system,
          prompt,
          temperature: opts.noTemperature ? undefined : opts.temperature,
          abortSignal: opts.signal,
          maxRetries: 1,
          maxOutputTokens: opts.maxOutputTokens ?? 4096,
        });
        usage.inputTokens += r.usage.inputTokens ?? 0;
        usage.outputTokens += r.usage.outputTokens ?? 0;
        text = r.text;
        const parsed = opts.schema.safeParse(extractJson(text));
        if (parsed.success) return { object: parsed.data, usage };
        prompt = `${opts.prompt}

Your previous reply did not validate (${parsed.error.message.slice(0, 400)}). Return only the corrected JSON object.`;
      } catch (e) {
        if (opts.signal?.aborted) throw new StageError(opts.stage, "aborted", "aborted");
        if (attempt === 1 || !(e instanceof SyntaxError || (e instanceof Error && /JSON/.test(e.message)))) {
          // Se informa el fallo de la vía nativa: suele ser el más explicativo (código HTTP, mensaje del proveedor).
          throw native;
        }
        prompt = `${opts.prompt}

Your previous reply was not valid JSON. Return only the JSON object.`;
      }
    }
    throw native;
  }
}
