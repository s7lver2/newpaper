import anthropic from './logos/anthropic.svg?raw';
import deepseek from './logos/deepseek.svg?raw';
import google from './logos/google.svg?raw';
import huggingface from './logos/huggingface.svg?raw';
import lmstudio from './logos/lmstudio.svg?raw';
import mistral from './logos/mistral.svg?raw';
import nvidia from './logos/nvidia.svg?raw';
import ollama from './logos/ollama.svg?raw';
import openai from './logos/openai.svg?raw';
import openrouter from './logos/openrouter.svg?raw';
import xai from './logos/xai.svg?raw';

/** Los SVG son marcas de un solo trazo y 24 px; se pintan con `currentColor`, así sirven en papel y en tinta. */
const clean = (svg: string) => svg.replace(/<title>[^<]*<\/title>/, '').replace(/^<svg /, '<svg aria-hidden="true" focusable="false" ');

export interface ProviderMeta {
  /** Fondo de la ficha del logo (mockup Proveedores.dc.html, `tint`). */
  tint: string;
  svg?: string;
  /** Sin logo: monograma en IBM Plex Mono. */
  mono?: string;
  /** Dominio que se enseña bajo «Consigue tu clave». */
  site?: string;
  /** Dónde está la clave en la web del proveedor y cómo se llama el botón (se dejan en inglés: son los de su web). */
  section?: string;
  button?: string;
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  openai: { tint: '#ECECEA', svg: clean(openai), site: 'platform.openai.com', section: 'API keys', button: 'Create new secret key' },
  nous: { tint: '#E9E4F7', mono: 'N', site: 'portal.nousresearch.com', section: 'API Keys', button: 'Create key' },
  anthropic: { tint: '#F6E7DD', svg: clean(anthropic), site: 'console.anthropic.com', section: 'Settings → API keys', button: 'Create Key' },
  google: { tint: '#E4EBFB', svg: clean(google), site: 'aistudio.google.com', section: 'Get API key', button: 'Create API key' },
  deepseek: { tint: '#E3E8FA', svg: clean(deepseek), site: 'platform.deepseek.com', section: 'API keys', button: 'Create new API key' },
  xai: { tint: '#EAEAEA', svg: clean(xai), site: 'console.x.ai', section: 'API Keys', button: 'Create API key' },
  mistral: { tint: '#FCE9D6', svg: clean(mistral), site: 'console.mistral.ai', section: 'API Keys', button: 'Create new key' },
  nvidia: { tint: '#E8F3DA', svg: clean(nvidia), site: 'build.nvidia.com', section: 'tu perfil → API Keys', button: 'Generate API Key' },
  openrouter: { tint: '#EAE8F6', svg: clean(openrouter), site: 'openrouter.ai/keys', section: 'Keys', button: 'Create Key' },
  groq: { tint: '#FBE4DC', mono: 'gq', site: 'console.groq.com/keys', section: 'API Keys', button: 'Create API Key' },
  huggingface: { tint: '#FFF1CC', svg: clean(huggingface), site: 'huggingface.co/settings/tokens', section: 'Settings → Access Tokens', button: 'Create new token' },
  ollama: { tint: '#EDEDEB', svg: clean(ollama) },
  lmstudio: { tint: '#E6E5FA', svg: clean(lmstudio) },
  custom: { tint: '#EFECE5', mono: '{ }' },
};

export const metaOf = (id: string): ProviderMeta => PROVIDER_META[id] ?? { tint: '#EFECE5', mono: id.slice(0, 2) };

/** Grupo de un proveedor en el asistente y en Ajustes: abiertos, cerrados, en tu equipo o avanzado.
 *  Los agregadores (`mixed`) van con los abiertos: sirven modelos de pesos abiertos y de los otros. */
export type ProviderGroup = 'open' | 'closed' | 'local' | 'advanced';
export function groupOf(p: { category: 'cloud' | 'local' | 'advanced'; openness: 'open' | 'closed' | 'mixed' }): ProviderGroup {
  if (p.category === 'local') return 'local';
  if (p.category === 'advanced') return 'advanced';
  return p.openness === 'closed' ? 'closed' : 'open';
}

/** Un paso típico (6.000 caracteres de artículo, 5 coberturas): sirve para poner un precio por modelo y por paso. */
export const TYPICAL_STEP = { input: 4000, output: 1500 };
