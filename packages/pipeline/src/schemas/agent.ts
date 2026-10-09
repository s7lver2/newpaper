import type { Visualization } from './visualization';

export interface AgentCitation { n: number; sourceId: string; title: string; url: string }
export interface MediaItem { kind: 'image' | 'video'; url: string; sourceId: string; caption: string }
export type AgentMode = 'ask' | 'verify' | 'explain';
export type AgentEvent =
  | { type: 'step'; tool: 'searchCoverage' | 'fetchSource' | 'getVerdicts' | 'renderVisualization' | 'showMedia' }
  | { type: 'text'; delta: string }
  | { type: 'visualization'; viz: Visualization }
  | { type: 'media'; media: MediaItem }
  | { type: 'done'; text: string; citations: AgentCitation[] }
  | { type: 'error'; message: string };
