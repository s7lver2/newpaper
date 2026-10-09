import { z } from 'zod';

export const ArticleInputSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  text: z.string().min(1),
  lang: z.string().nullable().optional(),
  siteName: z.string().nullable().optional(),
  byline: z.string().nullable().optional(),
  published: z.string().nullable().optional(),
});
export type ArticleInput = z.infer<typeof ArticleInputSchema>;
