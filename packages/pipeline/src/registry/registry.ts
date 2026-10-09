import { RegistryFileSchema, type ModelEntry, type ProviderCategory, type ProviderEntry } from './schema';

export interface Registry {
  providers: ProviderEntry[];
  get(id: string): ProviderEntry | undefined;
  model(providerId: string, modelId: string): ModelEntry | undefined;
  byCategory(cat: ProviderCategory): ProviderEntry[];
  recommended(): ProviderEntry[];
}

export function loadRegistry(json: unknown, priceOverrides: Record<string, { input: number; output: number }> = {}): Registry {
  const file = RegistryFileSchema.parse(json);
  const providers = file.providers.map((p) => ({
    ...p,
    models: p.models.map((m) => ({ ...m, price: priceOverrides[`${p.id}/${m.id}`] ?? m.price })),
  }));
  const get = (id: string) => providers.find((p) => p.id === id);
  return {
    providers,
    get,
    model: (pid, mid) => get(pid)?.models.find((m) => m.id === mid),
    byCategory: (cat) => providers.filter((p) => p.category === cat),
    recommended: () => providers.filter((p) => p.category === 'recommended'),
  };
}
