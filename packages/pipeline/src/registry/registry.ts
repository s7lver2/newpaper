import { RegistryFileSchema, type ModelEntry, type Openness, type ProviderCategory, type ProviderEntry, type RoadmapEntry } from './schema';

export interface Registry {
  providers: ProviderEntry[];
  /** Ideas futuras («Próximamente»): solo se muestran, no se pueden conectar ni asignar. */
  roadmap: RoadmapEntry[];
  get(id: string): ProviderEntry | undefined;
  model(providerId: string, modelId: string): ModelEntry | undefined;
  byCategory(cat: ProviderCategory): ProviderEntry[];
  recommended(): ProviderEntry[];
  /** Abierto/cerrado de un modelo concreto: el suyo, o el del proveedor si es de un solo tipo (`mixed` si no se sabe). */
  opennessOf(providerId: string, modelId: string): Openness;
}

export function loadRegistry(json: unknown, priceOverrides: Record<string, { input: number; output: number }> = {}): Registry {
  const file = RegistryFileSchema.parse(json);
  const providers = file.providers.map((p) => ({
    ...p,
    models: p.models.map((m) => ({ ...m, price: priceOverrides[`${p.id}/${m.id}`] ?? m.price })),
  }));
  const get = (id: string) => providers.find((p) => p.id === id);
  const roadmap = file.roadmap;
  for (const r of roadmap) if (providers.some((p) => p.id === r.id)) throw new Error(`roadmap id clashes with a provider: ${r.id}`);
  return {
    providers,
    roadmap,
    get,
    model: (pid, mid) => get(pid)?.models.find((m) => m.id === mid),
    byCategory: (cat) => providers.filter((p) => p.category === cat),
    opennessOf: (pid, mid) => get(pid)?.models.find((m) => m.id === mid)?.openness ?? get(pid)?.openness ?? 'mixed',
    recommended: () => providers.filter((p) => p.recommended),
  };
}
