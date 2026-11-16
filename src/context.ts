export type ContextSegment = { id: string; label: string; tokens: number };
export type ContextSnapshot = {
  segments: ContextSegment[]; limit: number; model: string; omitted: number; clipped: number;
  warning?: string;
  lastUsage?: { prompt: number; completion: number; reasoning?: number }; demo: boolean;
};
export function contextTotals(snapshot: ContextSnapshot) {
  const used = snapshot.segments.reduce((sum, s) => sum + (Number.isFinite(s.tokens) ? Math.max(0, s.tokens) : 0), 0);
  const limit = Number.isFinite(snapshot.limit) ? Math.max(0, snapshot.limit) : 0;
  return { used, limit, free: Math.max(0, limit - used), share: limit > 0 ? used / limit : 0 };
}
