import { z } from 'zod';

export const CapabilitySchema = z.enum(['structured', 'tools', 'vision', 'search']);
export const ProviderCategorySchema = z.enum(['cloud', 'local', 'advanced']);
/** open = pesos abiertos (se pueden ejecutar en casa); closed = solo propietarios; mixed = agregador con ambos. */
export const OpennessSchema = z.enum(['open', 'closed', 'mixed']);
/** Cómo se obtiene la clave sin pegarla. `available` = verificado con la documentación del proveedor; `unverified`/`gated` = marco listo, no se ejecuta. */
export const LoginSchema = z.object({
  flow: z.enum(['oauth-pkce-key', 'oauth-device']),
  status: z.enum(['available', 'unverified', 'gated']),
  authUrl: z.string().url().optional(),
  exchangeUrl: z.string().url().optional(),
});

export const ModelEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.object({ input: z.number().nonnegative(), output: z.number().nonnegative() }).nullable(),
  latency: z.enum(['fast', 'medium', 'slow']),
  capabilities: z.array(CapabilitySchema),
  tier: z.enum(['light', 'strong']),
  noTemperature: z.boolean().optional(),
  /** Solo cuando difiere del proveedor (agregadores). */
  openness: z.enum(['open', 'closed']).optional(),
});

export const ProviderEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  logo: z.string(),
  category: ProviderCategorySchema,
  recommended: z.boolean().default(false),
  /** Tiene un nivel gratuito (cuota o créditos) sin pagar; solo informa a la interfaz, no cambia ninguna asignación. */
  freeTier: z.boolean().default(false),
  openness: OpennessSchema,
  login: LoginSchema.optional(),
  type: z.enum(['cloud', 'local']),
  adapter: z.enum(['openai', 'anthropic', 'google', 'openai-compatible']),
  baseUrl: z.string().url(),
  auth: z.enum(['bearer', 'x_api_key', 'x_goog_api_key', 'none']),
  keyPrefixes: z.array(z.string()),
  keyUrl: z.string().url().nullable(),
  models: z.array(ModelEntrySchema),
});

/**
 * Idea futura que se enseña como «Próximamente»: no es un proveedor. No tiene URL, adaptador ni modelos y
 * por eso vive aparte (`roadmap`): nunca entra en la asignación automática, en la tabla del proxy ni en la lista de conectados.
 */
export const RoadmapEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  status: z.literal('planned'),
});

export const RegistryFileSchema = z.object({ version: z.literal(1), providers: z.array(ProviderEntrySchema), roadmap: z.array(RoadmapEntrySchema).default([]) });

export type Capability = z.infer<typeof CapabilitySchema>;
export type ProviderCategory = z.infer<typeof ProviderCategorySchema>;
export type Openness = z.infer<typeof OpennessSchema>;
export type LoginEntry = z.infer<typeof LoginSchema>;
export type RoadmapEntry = z.infer<typeof RoadmapEntrySchema>;
export type ModelEntry = z.infer<typeof ModelEntrySchema>;
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;
export type RegistryFile = z.infer<typeof RegistryFileSchema>;
