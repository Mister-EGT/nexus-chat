import { test, expect, type Page } from '@playwright/test';
async function sidebar(page: Page) {
  const sidebar = page.locator('#sidebar');
  if (await sidebar.evaluate(el => el.classList.contains('collapsed'))) await page.locator('#btn-toggle-sb').click();
}
test.beforeEach(async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-11-16T12:00:00Z'));
  await page.addInitScript(theme => { localStorage.setItem('nx_settings', JSON.stringify({ theme, sidebarOpen: true })); }, info.project.name.endsWith('dark') ? 'dark' : 'light');
  await page.route('https://openrouter.ai/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#msg-input')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});
for (const state of ['start', 'chat', 'models', 'settings', 'compare', 'command', 'sources', 'compare-results']) {
  test(state, async ({ page }) => {
    if (state === 'compare-results') {
      await page.clock.install({time:new Date('2026-11-16T12:00:00Z')});
      await page.clock.pauseAt(new Date('2026-11-16T12:00:01Z'));
      await sidebar(page); await page.locator('[data-studio="compare"]').click();
      await page.clock.runFor(32);
      await page.getByLabel('Gemeinsamer Prompt').fill('Wie plant man eine verständliche Erklärung?');
      await page.getByRole('button', {name:'Antworten vergleichen'}).click();
      await page.clock.runFor(1200);
      await expect(page.locator('.studio-loading')).toHaveCount(0);
    } else if (state === 'sources') {
      await sidebar(page);await page.locator('.chat-item[data-id="nexus-demo-chat"]').click();
      await page.locator('.layro-source-trigger').first().click();
      await expect(page.locator('.layro-source-card').first()).toBeVisible();
    } else if (state === 'chat') {
      await sidebar(page);
      await page.locator('.chat-item[data-id="nexus-demo-chat"]').click();
      await page.locator('.layro-activity-head').click();
      if (page.viewportSize()!.width > 768) {
        await page.locator('#msg-input').focus();
        await expect(page.locator('#msg-input')).toBeFocused();
      }
      await page.locator('.chat-container').evaluate(el => { el.scrollTop = 0; });
      await expect(page.locator('.chat-messages')).toHaveScreenshot('chat-content.png');
    } else if (state === 'models') await page.locator('#btn-model-sel').click();
    else if (state === 'settings') { await sidebar(page); await page.locator('#sb-settings').click(); }
    else if (state === 'compare' || state === 'command') { await sidebar(page); await page.locator(`[data-studio="${state}"]`).click(); }
    await expect(page).toHaveScreenshot(`${state}.png`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
  });
}
