import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function sidebar(page: Page) {
  if (await page.locator('#sidebar').evaluate(el => el.classList.contains('collapsed'))) await page.locator('#btn-toggle-sb').click();
}
async function start(page: Page) {
  await page.route('https://openrouter.ai/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#msg-input')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function focusContained(page: Page, dialog: Locator) {
  const controls = dialog.locator('button:visible:enabled, input:visible:enabled, textarea:visible:enabled, select:visible:enabled, a[href]:visible, summary:visible, [tabindex="0"]:visible');
  await controls.last().focus();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await controls.first().focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
}
async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, detail: n.failureSummary })) }))).toEqual([]);
}
test('System theme, OS changes, explicit choices, persistence and local fonts', async ({ page }, info) => {
  await start(page);
  const original = info.project.name.endsWith('dark') ? 'dark' : 'light';
  await expect(page.locator('html')).toHaveAttribute('data-theme', original);
  const opposite = original === 'dark' ? 'light' : 'dark';
  await page.emulateMedia({ colorScheme: opposite });
  await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', opposite === 'dark' ? '#17191d' : '#fcfcfd');
  await sidebar(page); await page.locator('#sb-settings').click();
  await page.locator('#set-theme').selectOption(original);
  await expect(page.locator('html')).toHaveAttribute('data-theme', original);
  await page.locator('#close-settings').click(); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', original);
  await sidebar(page); await page.locator('#sb-settings').click();
  await page.locator('#set-theme').selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Inter Variable');
  await page.evaluate(async () => { await document.fonts.load('16px "JetBrains Mono Variable"'); });
  expect(await page.evaluate(() => [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family))).toEqual(expect.arrayContaining(['Inter Variable', 'JetBrains Mono Variable']));
});
test('Native dialogs contain keyboard focus, escape closes and restores the trigger', async ({ page }) => {
  await start(page);
  for (const kind of ['models', 'settings', 'compare', 'command', 'prompts']) {
    if (kind !== 'models') await sidebar(page);
    const trigger = page.locator(kind === 'models' ? '#btn-model-sel' : kind === 'settings' ? '#sb-settings' : `[data-studio="${kind}"]`);
    await trigger.click();
    const dialog = page.locator('dialog[open]'); await expect(dialog).toHaveCount(1);
    expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
    await focusContained(page, dialog);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    if (await trigger.evaluate(el => el.closest('[inert]') !== null)) await expect(page.locator('#btn-toggle-sb')).toBeFocused();
    else await expect(trigger).toBeFocused();
  }
});
test('Comparison model search, separate streams, metrics and cancellation', async ({ page }) => {
  await start(page); await sidebar(page); await page.locator('[data-studio="compare"]').click();
  await page.getByRole('button', { name: /^Modell A/ }).click();
  const search = page.getByRole('combobox', { name: 'Modell A durchsuchen' });
  await search.fill('GPT'); await expect(page.locator('.compare-picker-menu').getByRole('option')).toHaveCount(1);
  await search.press('Escape'); await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.getByLabel('Gemeinsamer Prompt').fill('Erkläre verständlich, wie Streaming funktioniert.');
  await page.getByRole('button', { name: 'Antworten vergleichen' }).click();
  await expect(page.locator('.studio-loading')).toHaveCount(2);
  await expect(page.locator('.studio-answer').first()).toContainText('Simulierte Antwort');
  await expect(page.locator('.studio-loading')).toHaveCount(0);
  await expect(page.locator('.compare-live-metrics')).toHaveCount(2);
  await expect(page.locator('.compare-live-metrics').first()).toContainText('Token');
  await expect(page.getByText('Schnellste Antwort', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Antworten vergleichen' }).click();
  await page.getByRole('button', { name: 'Stoppen' }).click();
  await expect(page.getByText('Abgebrochen.', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Antworten vergleichen' })).toBeEnabled();
});
test('Sources open by tap and keyboard, transcript is not a live region', async ({ page }) => {
  await start(page); await sidebar(page); await page.locator('[data-id="nexus-demo-chat"]').click();
  await expect(page.locator('#chat-container')).not.toHaveAttribute('aria-live', /.+/);
  const summary = page.locator('.layro-source-trigger').first();
  await summary.scrollIntoViewIfNeeded(); await summary.click();
  await expect(page.locator('.layro-source-details').first()).toHaveAttribute('open', '');
  const link = page.locator('.layro-source-card').first().getByRole('link', { name: /Quelle öffnen/ });
  await expect(link).toBeVisible(); await link.focus(); await expect(link).toBeFocused();
  await summary.focus(); await summary.press('Enter');
  await expect(page.locator('.layro-source-details').first()).not.toHaveAttribute('open', '');
  await summary.press('Enter'); await expect(link).toBeVisible();
  expect(await link.evaluate(el => getComputedStyle(el).pointerEvents)).not.toBe('none');
});
test('Starter modes, composer labels, debounce and no horizontal overflow', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: /Mit Denken Eine Aufgabe/ }).click();
  await expect(page.locator('#btn-reasoning')).toHaveAttribute('aria-label', 'Denken: Auto');
  await page.getByRole('button', { name: /Mit Websuche Informationen/ }).click();
  await expect(page.locator('#btn-web-search')).toHaveAttribute('aria-pressed', 'true');
  await sidebar(page);
  await page.locator('#chat-search').fill('Nichts-passendes');
  await expect(page.locator('.chat-item')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
for (const state of ['start', 'chat', 'models', 'settings', 'compare', 'command']) {
  test(`WCAG AA audit: ${state}`, async ({ page }) => {
    await start(page);
    if (state === 'chat') { await sidebar(page); await page.locator('[data-id="nexus-demo-chat"]').click(); await page.locator('.layro-activity-head').click(); }
    if (state === 'models') await page.locator('#btn-model-sel').click();
    if (state === 'settings') { await sidebar(page); await page.locator('#sb-settings').click(); }
    if (state === 'compare' || state === 'command') { await sidebar(page); await page.locator(`[data-studio="${state}"]`).click(); }
    await axe(page);
  });
}
test('API explorer, transfer, connection and chat editing use the shared dialog lifecycle', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: /API-Explorer OpenRouter-Anfragen/ }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.locator('dialog[open]')).toHaveClass(/feature-panel/);
  await focusContained(page,page.locator('dialog[open]'));
  await page.keyboard.press('Escape'); await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.locator('#studio-status').click();
  await focusContained(page,page.locator('dialog[open]'));await page.keyboard.press('Escape');
  await sidebar(page);await page.locator('[data-studio="command"]').click();
  await page.getByRole('combobox').fill('Chat-Transfer');await page.getByRole('combobox').press('Enter');
  await expect(page.locator('#studio-dialog-title')).toHaveText('Chat-Transfer');
  await focusContained(page,page.locator('dialog[open]'));await page.keyboard.press('Escape');
  await sidebar(page);
  const row=page.locator('[data-id="nexus-demo-chat"]');await row.locator('summary').click();
  await row.getByRole('button',{name:'Umbenennen',exact:true}).click();
  await expect(page.locator('dialog[open]')).toHaveClass('modal');await expect(page.locator('#rename-input')).toBeFocused();
  await focusContained(page,page.locator('dialog[open]'));await page.keyboard.press('Escape');
  await row.locator('summary').click();await row.getByRole('button',{name:'Löschen',exact:true}).click();
  await expect(page.locator('#confirm-title')).toBeVisible();await focusContained(page,page.locator('dialog[open]'));await page.keyboard.press('Escape');
  await expect(row).toBeVisible();
});
test('Refined start keeps drafts, mobile tools fit, and advanced model filters stay available', async ({ page }) => {
  await start(page);
  await page.locator('#msg-input').fill('Meine eigene Notiz soll erhalten bleiben.');
  await page.getByRole('button',{name:/Schreiben Einen Text/}).click();
  await expect(page.locator('#msg-input')).toHaveValue(/Meine eigene Notiz soll erhalten bleiben\.$/);
  await expect(page.locator('.welcome-tools button')).toHaveCount(4);
  if (page.viewportSize()!.width===390) {
    const last=page.locator('.welcome-tools button').last();
    const box=await last.boundingBox();const footer=await page.locator('.workspace-footer').boundingBox();
    expect(box!.y+box!.height).toBeLessThanOrEqual(footer!.y);
    for(const selector of ['.layro-tool-pill','#btn-web-search','#btn-send','#btn-dictate']) {
      const bounds=await page.locator(selector).boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);expect(bounds!.width).toBeGreaterThanOrEqual(44);
    }
    await page.locator('.layro-tool-picker > summary').press('Enter');
    await expect(page.locator('.mobile-attachment-action')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.locator('#btn-model-sel').click();
  await expect(page.locator('.model-advanced-filters')).not.toHaveAttribute('open','');
  await page.getByText('Filter und Sortierung',{exact:true}).click();
  await expect(page.locator('#model-sort')).toBeVisible();
  await page.keyboard.press('Escape');await sidebar(page);await page.locator('#sb-settings').click();
  await page.locator('.settings-nav').getByRole('button',{name:'Oberfläche',exact:true}).click();
  await expect(page.locator('.settings-nav [aria-current="location"]')).toHaveText('Oberfläche');
});
