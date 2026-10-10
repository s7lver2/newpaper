import { switchToUi, uiInvoke } from '../helpers';

describe('first run and tour', () => {
  before(async () => {
    await uiInvoke('settings_set', { key: 'general.locale', value: 'es' });
    await uiInvoke('settings_set', { key: 'device.firstRunDone', value: false });
    await uiInvoke('settings_set', { key: 'tour.done', value: false });
    await browser.refresh();
  });

  it('goes from first run through the three steps and six marks to done', async () => {
    await switchToUi();
    await $('.np-firstrun').waitForDisplayed({ timeout: 30_000 });
    await $('button=Continuar').click();
    await $('h2=Bienvenido a newpaper').waitForDisplayed({ timeout: 10_000 });
    await $('button=Empezar').click();
    await $('#np-tour-t').waitForDisplayed();
    await $('button=Siguiente').click(); // temas
    await $('button=Solo en mi equipo').click(); // IA → preset privacidad
    await $('button=Conexión directa').click(); // red
    for (let i = 0; i < 6; i++) await $('button=Siguiente').click(); // seis marcas
    await $('button=Empezar a leer').click();
    await browser.waitUntil(async () => !(await $('.np-tour-card').isExisting()), { timeout: 5_000 });
    const done = await uiInvoke<boolean | null>('settings_get', { key: 'tour.done' });
    expect(done).toBe(true);
    expect(await uiInvoke<string | null>('settings_get', { key: 'ai.preset' })).toBe('privacy');
  });
});
