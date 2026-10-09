import { z } from 'zod';

export const CapabilitySchema = z.enum(['structured', 'tools', 'vision', 'search']);
export const ProviderCategorySchema = z.enum(['recommended', 'cloud', 'local', 'advanced']);

export const ModelEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.object({ input: z.number().nonnegative(), output: z.number().nonnegative() }).nullable(),
  latency: z.enum(['fast', 'medium', 'slow']),
  capabilities: z.array(CapabilitySchema),
  tier: z.enum(['light', 'strong']),
  noTemperature: z.boolean().optional(),
});

export const ProviderEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  logo: z.string(),
  category: ProviderCategorySchema,
  type: z.enum(['cloud', 'local']),
  adapter: z.enum(['openai', 'anthropic', 'google', 'openai-compatible']),
  baseUrl: z.string().url(),
  auth: z.enum(['bearer', 'x_api_key', 'x_goog_api_key', 'none']),
  keyPrefixes: z.array(z.string()),
  keyUrl: z.string().url().nullable(),
  models: z.array(ModelEntrySchema),
});

export const RegistryFileSchema = z.object({ version: z.literal(1), providers: z.array(ProviderEntrySchema) });

export type Capability = z.infer<typeof CapabilitySchema>;
export type ProviderCategory = z.infer<typeof ProviderCategorySchema>;
export type ModelEntry = z.infer<typeof ModelEntrySchema>;
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;
export type RegistryFile = z.infer<typeof RegistryFileSchema>;
