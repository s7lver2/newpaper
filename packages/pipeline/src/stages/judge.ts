import { z } from 'zod';
import { delimit, UNTRUSTED_NOTE } from '../llm/delimit';
import { languageInstruction, type OutputLocale } from '../llm/language';
import { generateStructured } from '../llm/structured';
import { SignalKindSchema } from '../schemas/score';
import { docLabel } from './anonymize';
import type { StageCtx, StageResult } from './ctx';
import type { JudgeOutput } from './framing';

const Side = z.enum(['left', 'center', 'right']);
const JudgeSchema = z.object({
  signals: z.array(z.object({ kind: SignalKindSchema.exclude(['voces', 'omision']), value: z.number().min(-1).max(1), evidence: z.array(z.string()) })),
  actors: z.array(z.object({ name: z.string(), quotes: z.number().int().nonnegative(), side: Side })),
  lastWordSide: Side.nullable(),
  omissions: z.array(z.object({ fact: z.string(), favors: z.enum(['left', 'right', 'none']), foundIn: z.string() })),
});

/** Rúbrica cerrada (§5.2.1.3 y .5) con anclas de ambos lados. Los ejemplos de anclas siguen la tabla de la spec. */
const RUBRIC = `Score each observable signal on a fixed scale from -1 (the document leans to the political left of the group of documents) to +1 (leans right); 0 = like the centre of the group.
Signals and anchors:
- lexico (word choice used disproportionately by one bloc): -1 "patronal" vs +1 "empresarios"; -1 "personas que ocupan" vs +1 "okupas".
- encuadre (economic, moral, conflict, security, rights frame): -1 a wage rise as "social justice" vs +1 as "a threat to jobs".
- atribucion (verbs that judge the speaker): "denuncia", "alerta", "reconoce" vs neutral "dice", "afirma". Sign by whom it favours.
- adjetivacion (evaluative adjectives, hyperbole): "apocalipsis de empleo", "fiel a su costumbre".
- orden (what the headline and the start highlight, what is left for the end).
For each signal you MUST quote the exact fragments of Documento A / Document A that justify it in "evidence"; a signal without a verbatim quote does not count.
List the actors quoted in Document A with the number of quotes and the side they speak for, and which side has the last word.
List omissions: facts present in the OTHER documents but absent from Document A, with the side the omitted fact favours and the document label where it appears.
You do not know who published any document. Judge only the text.`;

export async function judgeDocument(o: { ctx: StageCtx; docA: string; others: { label: string; text: string }[]; mode: 'relative' | 'absolute' }): Promise<StageResult<JudgeOutput>> {
  const locale: OutputLocale = o.ctx.locale;
  const a = docLabel(0, locale);
  const r = await generateStructured({
    model: o.ctx.model,
    schema: JudgeSchema,
    system: `${RUBRIC}\n${o.mode === 'relative' ? 'Positions are relative to the group of documents (the coverage of the same event), not to an absolute centre.' : 'There are no other documents: score against a neutral wire-service style.'}\n${UNTRUSTED_NOTE}\n${languageInstruction(locale)}`,
    prompt: [delimit(a, o.docA), ...o.others.map((d) => delimit(d.label, d.text))].join('\n'),
    stage: 'score',
    temperature: o.ctx.temperature ?? 0,
    noTemperature: o.ctx.noTemperature,
    maxOutputTokens: o.ctx.maxOutputTokens,
    providerOptions: o.ctx.providerOptions,
    signal: o.ctx.signal,
  });
  return { value: r.object as JudgeOutput, usage: r.usage };
}
