export type ThemeChoice = 'system' | 'light' | 'dark';
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): 'light' | 'dark' {
  return choice === 'system' ? systemDark ? 'dark' : 'light' : choice;
}
export function applyDocumentTheme(choice: ThemeChoice) {
  const theme = resolveTheme(choice, matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themeChoice = choice;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#17191d' : '#fcfcfd');
}
export function modifierLabel(platform: string): string { return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘' : 'Strg'; }
export function platformModifier(): string { return modifierLabel(navigator.platform); }
