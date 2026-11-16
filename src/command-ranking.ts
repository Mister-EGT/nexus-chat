// Adapted from Layro @ddoemonn/command-palette (MIT), version 1.0.0.
export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  shortcut?: string[];
  group?: string;
};
const BOUNDARY = /[\s\-_/.:]/;
function scoreOne(text: string, query: string): number {
  const normalized = text.toLocaleLowerCase("de");
  let cursor = 0, total = 0, streak = 0;
  for (let index = 0; index < query.length; index++) {
    const at = normalized.indexOf(query[index], cursor);
    if (at < 0) return -1;
    streak = at === cursor && index > 0 ? streak + 1 : 0;
    total += 2 + streak * 4;
    if (at === 0) total += 12;
    else if (BOUNDARY.test(normalized[at - 1])) total += 8;
    cursor = at + 1;
  }
  return total;
}
export function rankCommands(items: CommandItem[], query: string): CommandItem[] {
  const normalized = query.trim().toLocaleLowerCase("de");
  if (!normalized) return items;
  return items.map((item, order) => {
    const direct = scoreOne(item.label, normalized);
    const alias = item.keywords ? scoreOne(item.keywords, normalized) - 3 : -1;
    const score = Math.max(direct, alias);
    return { item, order, matched: score >= 0, score: score - item.label.length * 0.05 };
  }).filter(({ matched }) => matched)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ item }) => item);
}
