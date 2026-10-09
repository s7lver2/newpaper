import { createServer, type Server } from 'node:http';

const ok = (o: unknown) => JSON.stringify(o);

/** Respuesta estructurada según el mensaje de sistema de cada etapa (subproyecto 4). */
function answer(system: string): string {
  if (system.includes('Return only loaded phrases') || system.includes("List the article's claims")) {
    return ok({
      claims: [{ id: 'x', quote: 'ha crecido un 61 %', span: [0, 0], kind: 'cifra', checkable: true }],
      loadedPhrases: [{ quote: 'fiel a su costumbre', span: [0, 0], reason: 'Valorativo' }],
    });
  }
  if (system.includes('Propose up to')) return ok({ urls: [] });
  if (system.includes('You verify claims')) return ok({ verdicts: [{ claimId: 'c1', status: 'no_verificable', explanation: 'Sin fuentes recuperadas.', sourceIds: [] }] });
  if (system.includes('Score each observable signal')) {
    return ok({
      signals: [{ kind: 'adjetivacion', value: -0.6, evidence: ['fiel a su costumbre'] }, { kind: 'encuadre', value: -0.5, evidence: ['apocalipsis de empleo'] }],
      actors: [{ name: 'Sindicatos', quotes: 1, side: 'left' }],
      lastWordSide: 'left',
      omissions: [],
    });
  }
  if (system.includes('Write a neutral version')) {
    return ok({ headline: 'El Gobierno sube el SMI', summary3: ['Uno.', 'Dos.', 'Tres.'], facts: [], parties: [], disputes: [], unknowns: ['Efecto en el empleo'], visualizations: [], rewrites: [{ from: 'fiel a su costumbre', to: '', reason: 'Valorativo' }] });
  }
  if (system.includes('Almost nobody has covered')) {
    return ok({ unverified: true, confidence: 0.2, claims: [{ text: 'Sube el SMI', tag: 'fuente_unica', note: 'Un solo medio' }], howToCheck: ['Busca el real decreto en el BOE'], sources: [] });
  }
  if (system.includes('machine-generated')) return ok({ paragraphs: [] });
  return ok({});
}

export function startMockLlm(port = 4568): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (!req.url?.endsWith('/chat/completions')) return void res.writeHead(404).end();
      const r = JSON.parse(body) as { stream?: boolean; messages: { role: string; content: string | { text?: string }[] }[] };
      const system = r.messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join(''))).join('\n');
      const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      if (r.stream) {
        // Agente: texto con una cita que no corresponde a ninguna fuente recuperada ([1]) para comprobar que se elimina.
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const chunk = (delta: object, finish: string | null, extra: object = {}) =>
          res.write(`data: ${ok({ id: 'c', object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`);
        chunk({ role: 'assistant', content: 'La subida es reciente ' }, null);
        chunk({ content: '[1].' }, null);
        chunk({}, 'stop', { usage });
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        ok({ id: 'c', object: 'chat.completion', created: 0, model: 'mock', choices: [{ index: 0, message: { role: 'assistant', content: answer(system) }, finish_reason: 'stop' }], usage }),
      );
    });
  });
  return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)));
}
