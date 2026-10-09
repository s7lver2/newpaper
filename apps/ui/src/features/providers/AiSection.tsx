import { useI18n } from '@newpaper/i18n/react';
import { autoAssign, describeAssignment, PRESETS, type Assignments, type Registry, type StageId } from '@newpaper/pipeline';
import { Button, SegmentedControl } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { MonthUsage } from '../../ipc/types';
import { parseInternalUrl } from '../../shell/internalUrl';
import { openInternal } from '../../shell/navigate';
import { useActiveTab } from '../../state/browser';
import { getRegistry, useAiSettings } from '../ai/pipeline';
import { ConnectWizard } from './ConnectWizard';

export function AiSection() {
  const { t, formatCurrency } = useI18n();
  const ai = useAiSettings();
  const tab = useActiveTab();
  const connecting = parseInternalUrl(tab?.url ?? '')?.path[1] === 'conectar';
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [usage, setUsage] = useState<MonthUsage | null>(null);
  const [local, setLocal] = useState<Record<string, string[]>>({});

  useEffect(() => {
    void getRegistry().then(setRegistry);
    void commands.usageMonth().then(setUsage).catch(() => {});
    void commands.aiLocalProbe().then((p) => setLocal(Object.fromEntries(Object.entries(p).filter(([, v]) => v?.length)) as Record<string, string[]>)).catch(() => {});
  }, []);

  if (connecting) return <ConnectWizard onDone={() => void openInternal('ajustes', ['ia'])} />;
  if (!registry) return null;
  const auto = autoAssign(registry, [...ai.connected, ...Object.keys(local)], ai.preset, local);
  const manual = Object.keys(ai.assignments).length > 0;
  const effective: Assignments = manual ? ai.assignments : auto;
  const options = [...ai.connected, ...Object.keys(local)].flatMap((pid) => {
    const p = registry.get(pid);
    if (!p) return [];
    const models = local[pid] ?? p.models.map((m) => m.id);
    return models.map((m) => ({ value: `${pid}/${m}`, label: `${p.name} · ${registry.model(pid, m)?.name ?? m}` }));
  });
  const setStage = (stage: StageId, value: string) => {
    const [provider, ...rest] = value.split('/');
    void ai.setAssignments({ ...effective, [stage]: { provider: provider!, model: rest.join('/') } });
  };
  const disconnect = async (id: string) => {
    await commands.secretDelete(`ai.${id}`);
    await ai.setConnected(ai.connected.filter((x) => x !== id));
  };

  return (
    <div className="np-ai-section">
      <h3>{t('providers.connected')}</h3>
      {ai.connected.length === 0 && Object.keys(local).length === 0 ? (
        <div className="np-wizard-detected">
          <p className="np-muted">{t('providers.noneConnected')}</p>
          <p>{t('providers.subtitle')}</p>
        </div>
      ) : null}
      <ul className="np-ai-connected">
        {ai.connected.map((id) => (
          <li key={id}>
            <span>{registry.get(id)?.name ?? id}</span>
            <Button variant="quiet" onClick={() => void disconnect(id)}>{t('providers.disconnect')}</Button>
          </li>
        ))}
        {Object.keys(local).map((id) => (
          <li key={id}>
            <span>{registry.get(id)?.name ?? id}</span>
            <span className="np-tag np-tag--ok">{t('providers.detectedLocal', { n: local[id]!.length })}</span>
          </li>
        ))}
      </ul>
      <Button variant="primary" onClick={() => void openInternal('ajustes', ['ia', 'conectar'])}>{t('providers.connectOne')}</Button>

      <h3>{t('providers.pipeline')}</h3>
      <SegmentedControl label={t('providers.preset.label')} value={ai.preset} onChange={(v) => void ai.setPreset(v)} options={PRESETS.map((p) => ({ value: p.id, label: t(`providers.preset.${p.id}`) }))} />
      <p className="np-muted">{t(`providers.presetHint.${ai.preset}`)}</p>
      <table className="np-table">
        <thead>
          <tr>
            <th scope="col">{t('providers.stage')}</th>
            <th scope="col">{t('providers.model')}</th>
          </tr>
        </thead>
        <tbody>
          {describeAssignment(registry, effective).map((r) => (
            <tr key={r.stage}>
              <td>{t(`analysis.stage.${r.stage}`)}</td>
              <td>
                <select aria-label={t('providers.modelFor', { stage: t(`analysis.stage.${r.stage}`) })} value={`${effective[r.stage]!.provider}/${effective[r.stage]!.model}`} onChange={(e) => setStage(r.stage, e.target.value)}>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {manual ? <Button variant="quiet" onClick={() => void ai.setAssignments({})}>{t('providers.backToAuto')}</Button> : <p className="np-muted">{t('providers.auto')}</p>}

      <h3>{t('providers.budget')}</h3>
      <label className="np-field">
        <span>{t('providers.limit')}</span>
        <input
          type="number"
          min={0}
          step={1}
          value={ai.monthlyLimitUsd ?? ''}
          onChange={(e) => void ai.setMonthlyLimitUsd(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
        />
        <span className="np-muted">{t('providers.limitHint')}</span>
      </label>
      {usage ? <p>{t('providers.spent', { amount: formatCurrency(usage.cost, 'USD') })}</p> : null}
    </div>
  );
}
