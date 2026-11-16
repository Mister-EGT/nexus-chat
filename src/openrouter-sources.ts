export type Citation = { url: string; label: string; description?: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

export function normalizeCitations(values: unknown): Citation[] {
  if (!Array.isArray(values)) return [];
  const sources = new Map<string, Citation>();
  for (const value of values) {
    const item = record(value);
    if (typeof item?.url !== "string") continue;
    let url: URL;
    try { url = new URL(item.url); } catch { continue; }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) continue;
    const existing = sources.get(url.href);
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 250) : "";
    const description = typeof item.description === "string" ? item.description.trim().slice(0, 500) : "";
    sources.set(url.href, { url: url.href, label: label || existing?.label || url.hostname, description: description || existing?.description });
  }
  return [...sources.values()];
}

export function citationSources(annotations: unknown): Citation[] {
  if (!Array.isArray(annotations)) return [];
  return normalizeCitations(annotations.flatMap((value) => {
    const annotation = record(value);
    const citation = record(annotation?.url_citation) ?? (annotation?.type === "url_citation" ? annotation : undefined);
    if (!citation) return [];
    return [{ url: citation.url, label: citation.title, description: citation.content }];
  }));
}
