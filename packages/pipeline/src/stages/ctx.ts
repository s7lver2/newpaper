import type { LanguageModel } from 'ai';
import type { OutputLocale } from '../llm/language';
import type { Usage } from '../llm/structured';

export interface StageCtx { model: LanguageModel; noTemperature: boolean; temperature?: number; locale: OutputLocale; signal?: AbortSignal }
export interface StageResult<T> { value: T; usage: Usage }

export const addUsage = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens });
export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };
