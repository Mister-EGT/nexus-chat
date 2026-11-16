import { defineConfig } from '@playwright/test';
const stage = process.env.VISUAL_STAGE || 'baseline';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  snapshotPathTemplate: `{testDir}/../visual/${stage}/{projectName}/{arg}{ext}`,
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.001 } },
  use: { baseURL: 'http://127.0.0.1:4173', locale: 'de-DE', timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', trace: 'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined },
  projects: ['light', 'dark'].flatMap(theme => [
    { name: `desktop-${theme}`, use: { viewport: { width: 1440, height: 1000 }, colorScheme: theme as 'light' | 'dark' } },
    { name: `mobile-${theme}`, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme as 'light' | 'dark' } },
  ]),
  webServer: { command: 'pnpm dev --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
