import type { Article } from '@newpaper/extract';
import type { LanguageModel } from 'ai';
import type { Assignments } from '../assign/presets';
import type { CacheStore } from '../cache/key';
import type { UsageSink } from '../cost/estimate';
import type { OutputLocale } from '../llm/language';
import type { Registry } from '../registry/registry';
import type { Coverage } from '../schemas/coverage';
import type { FramingWeights } from '../stages/framing';

export interface CoverageResult { eventId: number | null; coverages: Coverage[]; outletCount: number; searched: boolean; searchSkipped: string | null; enough: boolean }
export interface LexiconScore { status: 'ok' | 'insufficient' | 'unavailable'; value: number | null; confidence: number; matches: { phrase: string; weight: number; start: number; end: number }[] }

export interface CoverageService {
  coverageFor(url: string, title: string, excerpt: string): Promise<CoverageResult>;
  /** Búsqueda libre en el índice (herramienta `searchCoverage` del agente). */
  search(query: string): Promise<Coverage[]>;
}
export interface LexiconService { score(text: string, locale: OutputLocale): Promise<LexiconScore> }
export interface SourceFetcher { fetch(url: string, allowExtra: string[]): Promise<string> }
export type ExtractFn = (html: string, url: string) => Article | null;
export interface ModelFactory { get(ref: { provider: string; model: string }): { model: LanguageModel; noTemperature: boolean } }

export interface PipelineDeps {
  registry: Registry;
  models: ModelFactory;
  assignments(): Promise<Assignments>;
  /** Gasto del mes y límite (null = sin límite). */
  budget(): Promise<{ spentUsd: number; limitUsd: number | null }>;
  usage: UsageSink;
  cache: CacheStore;
  coverage: CoverageService;
  lexicon: LexiconService;
  sources: SourceFetcher;
  extract: ExtractFn;
  /** Dominios de fuentes primarias del idioma de contenidos. */
  primaryDomains(): Promise<string[]>;
  /** Ids de partido de `config/parties-<locale>.json` (validan el hemiciclo). */
  partyIds(): Promise<string[]>;
  /** Pesos de `config/framing-weights.json`. */
  framingWeights(): Promise<FramingWeights>;
  locale(): OutputLocale;
  onAnalyzed?(url: string): Promise<void>;
}
