// @vitest-environment node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createModel } from '../registry/models';
import type { ProviderEntry } from '../registry/schema';
import type { AgentEvent } from '../schemas/agent';
import { makeProxyFetch, type AiInvoker, type ProxyEvent } from '../transport/proxyFetch';
import { SMI_ARTICLE } from '../test/fixtures';
import { runAgent, type AgentContext } from './agent';

/**
 * El agente por el MISMO camino que en el móvil (streamText -> @ai-sdk/google -> makeProxyFetch -> invocador), con un servidor
 * local que imita a Gemini (SSE y no-SSE) y un invocador que imita al proxy de Rust (eventos head/chunk/end). Sin red ni claves.
 */
type Mode = 'sse' | 'sse-no-tools' | 'hang-stream' | 'hang-all' | 'thinking-only' | 'json-only';
let mode: Mode = 'sse';
let server: Server;
let baseURL = '';
let streamCalls = 0;
let genCalls = 0;

const part = (text: string, finish = false) => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0, ...(finish ? { finishReason: 'STOP' } : {}) }],
  ...(finish ? { usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 8, totalTokenCount: 38 } } : {}),
});

async function readBody(req: IncomingMessage): Promise<string> {
  let b = '';
  for await (const c of req) b += c;
  return b;
}

function handle(req: IncomingMessage, res: ServerResponse, body: string) {
  const stream = req.url!.includes(':streamGenerateContent');
  if (stream) streamCalls++;
  else genCalls++;
  const hasTools = body.includes('functionDeclarations');
  if (mode === 'hang-all') return; // no responde nunca
  if (mode === 'hang-stream' && stream) return;
  if (mode === 'sse-no-tools' && hasTools) {
    res.writeHead(400, { 'content-type': 'application/json' });
    return void res.end(JSON.stringify({ error: { code: 400, message: 'Invalid JSON payload received. Unknown name "prefixItems" at tools', status: 'INVALID_ARGUMENT' } }));
  }
  if (mode === 'thinking-only') {
    const empty = { candidates: [{ content: { role: 'model', parts: [] }, index: 0, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 0, thoughtsTokenCount: 2048, totalTokenCount: 2078 } };
    res.writeHead(200, { 'content-type': stream ? 'text/event-stream' : 'application/json' });
    return void res.end(stream ? `data: ${JSON.stringify(empty)}\n\n` : JSON.stringify(empty));
  }
  if (stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify(part('El comunicado '))}\n\n`);
    setTimeout(() => {
      res.write(`data: ${JSON.stringify(part('pide la dimisión de Tebas.', true))}\n\n`);
      res.end();
    }, 30);
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'El comunicado pide la dimisión de Tebas.' }] }, index: 0, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 8, totalTokenCount: 38 } }));
}

beforeAll(async () => {
  server = createServer((req, res) => void readBody(req).then((b) => handle(req, res, b)));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`;
});
afterAll(() => void server.close());

const provider = (): ProviderEntry => ({ id: 'google', name: 'Gemini', logo: 'x', category: 'cloud', recommended: true, freeTier: true, openness: 'closed', type: 'cloud', adapter: 'google', baseUrl: baseURL, auth: 'x_goog_api_key', keyPrefixes: [], keyUrl: null, models: [] });

/** Como el proxy de Rust: head, trozos en base64 y fin. `buffered` entrega el cuerpo entero de golpe (un transporte que no hace streaming). */
function invoker(opts: { buffered?: boolean } = {}): AiInvoker {
  const live = new Map<string, AbortController>();
  return {
    async fetch(_p, req, onEvent: (e: ProxyEvent) => void) {
      const ac = new AbortController();
      live.set(req.requestId, ac);
      try {
        const res = await fetch(req.url, { method: req.method, headers: Object.fromEntries(req.headers), body: req.body, signal: ac.signal });
        onEvent({ event: 'head', data: { status: res.status, headers: [...res.headers.entries()] } });
        const reader = res.body!.getReader();
        const all: Buffer[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (opts.buffered) all.push(Buffer.from(value));
          else onEvent({ event: 'chunk', data: { b64: Buffer.from(value).toString('base64') } });
        }
        if (opts.buffered) onEvent({ event: 'chunk', data: { b64: Buffer.concat(all).toString('base64') } });
        onEvent({ event: 'end' });
      } catch (e) {
        onEvent({ event: 'error', data: { code: ac.signal.aborted ? 'cancelled' : 'network', message: String(e) } });
      }
    },
    async cancel(id) {
      live.get(id)?.abort();
      return true;
    },
  };
}

const context = (): AgentContext => ({ article: SMI_ARTICLE, coverages: [], sources: [], verdicts: [], partyIds: new Set(), primaryDomains: [] });

async function ask(o: { buffered?: boolean; idleMs?: number; signal?: AbortSignal } = {}) {
  streamCalls = 0;
  genCalls = 0;
  const events: AgentEvent[] = [];
  const model = createModel(provider(), 'gemini-3.8-flash', makeProxyFetch('google', invoker({ buffered: o.buffered })), baseURL);
  const run = runAgent({
    ctx: { model, noTemperature: false, locale: 'es', maxOutputTokens: 16384, signal: o.signal },
    context: context(), mode: 'ask', question: '¿Qué dice el comunicado?',
    coverage: { coverageFor: async () => { throw new Error('unused'); }, search: async () => [] },
    fetcher: { fetch: async () => '' }, extract: () => null, onEvent: (e) => events.push(e), idleMs: o.idleMs ?? 400,
  });
  return { run, events };
}

describe('agent through the proxy transport with a Gemini-like server', () => {
  it('streams the answer incrementally', async () => {
    mode = 'sse';
    const { run, events } = await ask();
    const r = await run;
    expect(r.text).toBe('El comunicado pide la dimisión de Tebas.');
    expect(events.filter((e) => e.type === 'text').length).toBeGreaterThanOrEqual(2);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(genCalls).toBe(0);
  });

  it('works when the transport buffers the whole SSE body', async () => {
    mode = 'sse';
    const r = await (await ask({ buffered: true })).run;
    expect(r.text).toContain('dimisión de Tebas');
  });

  it('retries without tools when the provider rejects the tool schema', async () => {
    mode = 'sse-no-tools';
    const { run, events } = await ask();
    const r = await run;
    expect(r.text).toContain('dimisión de Tebas');
    expect(events.some((e) => e.type === 'retry' && e.reason === 'tools')).toBe(true);
  });

  it('does not hang: a silent stream times out and falls back to a non-streaming call', async () => {
    mode = 'hang-stream';
    const t0 = Date.now();
    const { run, events } = await ask({ idleMs: 250 });
    const r = await run;
    expect(r.text).toContain('dimisión de Tebas');
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(events.filter((e) => e.type === 'retry').map((e) => (e as { reason: string }).reason)).toEqual(['tools', 'stream']);
    expect(genCalls).toBe(1);
  });

  it('does not hang when nothing ever answers: ends with a visible error', async () => {
    mode = 'hang-all';
    const { run, events } = await ask({ idleMs: 200 });
    await expect(run).rejects.toThrow(/sin respuesta/);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
  }, 10_000);

  it('reports an empty reply (the model spent every token thinking) instead of an empty bubble', async () => {
    mode = 'thinking-only';
    const { run, events } = await ask();
    await expect(run).rejects.toThrow(/no devolvió ninguna respuesta/);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
  });

  it('stops right away when the user cancels', async () => {
    mode = 'hang-all';
    const ac = new AbortController();
    const { run } = await ask({ idleMs: 30_000, signal: ac.signal });
    setTimeout(() => ac.abort(), 100);
    const t0 = Date.now();
    await expect(run).rejects.toThrow(/abort/i);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
