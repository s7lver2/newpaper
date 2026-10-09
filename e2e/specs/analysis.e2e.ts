import { FIXTURE_URL, switchToUi, uiInvoke } from '../helpers';

const ref = { provider: 'custom', model: 'mock' };

describe('analysis experience', () => {
  before(async () => {
    await uiInvoke('settings_set', { key: 'general.locale', value: 'es' });
    await uiInvoke('ai_set_endpoints', { endpoints: [{ id: 'custom', baseUrl: 'http://127.0.0.1:4568/v1', auth: 'bearer', local: true }] });
    await uiInvoke('secret_set', { key: 'ai.custom', value: 'e2e-test-key' });
    await uiInvoke('settings_set', { key: 'ai.connected', value: ['custom'] });
    await uiInvoke('settings_set', {
      key: 'ai.assignments',
      value: { claims: ref, quickScore: ref, verify: ref, score: ref, synthesis: ref, agent: ref, investigate: ref },
    });
    await uiInvoke('settings_set', { key: 'ai.quickOnOpen', value: true });
  });

  it('runs quick then full analysis, shows the uncovered flow and asks the agent about a selection', async () => {
    const tab = await uiInvoke<{ id: number }>('tab_open', { url: FIXTURE_URL('smi.html') });
    await browser.pause(1500);
    await uiInvoke('tab_set_view', { tabId: tab.id, view: 'reader' });
    await switchToUi();

    // Análisis rápido automático: aparece la insignia de neutralidad en la barra.
    await $('.np-abtn-badge').waitForDisplayed({ timeout: 30_000 });

    // Análisis completo desde el lector.
    await $('button=Analizar').click();
    await $('.np-claim').waitForDisplayed({ timeout: 60_000 });
    expect(await $('.np-claim-quote').getText()).toContain('ha crecido un 61 %');
    await $('mark[data-mark="c1"]').waitForExist({ timeout: 10_000 });

    // Sin coberturas ni fuentes primarias: flujo de hecho sin cobertura con confirmación obligatoria.
    await $('button=Investigar de todos modos').click();
    const confirm = await $('button=Investigar sin verificar');
    expect(await confirm.isEnabled()).toBe(false);
    await $('.np-consent input[type="checkbox"]').click();
    await confirm.click();
    await $('.np-unverified').waitForDisplayed({ timeout: 30_000 });

    // Selección en el lector → Preguntar → el agente responde y la cita sin fuente desaparece.
    await browser.execute(() => {
      const mark = document.querySelector('mark[data-mark="l1"]')!;
      const range = document.createRange();
      range.selectNodeContents(mark);
      const sel = document.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await $('.np-seltool').waitForDisplayed({ timeout: 5_000 });
    await $('button=Preguntar').click();
    await $('#np-agent-q').setValue('¿Es una frase neutral?');
    await $('button=Enviar').click();
    await browser.waitUntil(async () => (await $$('.np-agent-msg--assistant')).length > 0 && (await $('.np-agent-msg--assistant').getText()).includes('La subida es reciente'), { timeout: 30_000 });
    const reply = await $('.np-agent-msg--assistant').getText();
    expect(reply).not.toContain('[1]');
    expect(await $$('.np-agent-msg--assistant .np-cite')).toHaveLength(0);

    await uiInvoke('tab_close', { tabId: tab.id });
  });
});
