const STATUS_TEXT: Record<number, string> = { 400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found", 408: "Request Timeout", 422: "Unprocessable Entity", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };

export interface ProxyRequest { requestId: string; url: string; method: string; headers: [string, string][]; body: string | null }
export type ProxyEvent =
  | { event: 'head'; data: { status: number; headers: [string, string][] } }
  | { event: 'chunk'; data: { b64: string } }
  | { event: 'end' }
  | { event: 'error'; data: { code: string; message: string } };

export interface AiInvoker {
  fetch(provider: string, req: ProxyRequest, onEvent: (e: ProxyEvent) => void): Promise<void>;
  cancel(requestId: string): Promise<boolean>;
}

export class ProxyFetchError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ProxyFetchError';
  }
}

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

export function makeProxyFetch(provider: string, invoker: AiInvoker): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const body = init?.body !== undefined && init.body !== null ? await request.text() : null;
    const headers: [string, string][] = [];
    request.headers.forEach((v, k) => headers.push([k, v]));
    const req: ProxyRequest = { requestId: crypto.randomUUID(), url: request.url, method: request.method, headers, body };
    const signal = init?.signal ?? null;
    if (signal?.aborted) throw abortError();

    return new Promise<Response>((resolve, reject) => {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      let started = false;
      let finished = false;
      const stream = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
      const onAbort = () => {
        void invoker.cancel(req.requestId);
        if (!started) reject(abortError());
        else if (!finished) controller.error(abortError());
        finished = true;
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const onEvent = (e: ProxyEvent) => {
        if (finished) return;
        switch (e.event) {
          case 'head':
            started = true;
            // 204/205/304 no admiten cuerpo en el constructor de Response.
            resolve(new Response([204, 205, 304].includes(e.data.status) ? null : stream, { status: e.data.status, statusText: STATUS_TEXT[e.data.status] ?? "", headers: e.data.headers }));
            break;
          case 'chunk':
            controller.enqueue(decode(e.data.b64));
            break;
          case 'end':
            finished = true;
            controller.close();
            signal?.removeEventListener('abort', onAbort);
            break;
          case 'error': {
            finished = true;
            const err = new ProxyFetchError(e.data.code, e.data.message);
            if (started) controller.error(err);
            else reject(err);
            signal?.removeEventListener('abort', onAbort);
          }
        }
      };
      invoker.fetch(provider, req, onEvent).catch((err: unknown) => {
        if (!finished) onEvent({ event: 'error', data: { code: 'transport', message: String(err) } });
      });
    });
  }) as typeof fetch;
}
