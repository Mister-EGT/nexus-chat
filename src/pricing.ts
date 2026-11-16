export function tokenPrices(pricing?: { prompt?: unknown; completion?: unknown }) {
  const read = (value: unknown) => value == null || value === "" ? null : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  return { prompt: read(pricing?.prompt), completion: read(pricing?.completion) };
}
export function compareTokenPrices(a: {pricing?: {prompt?: unknown; completion?: unknown}}, b: {pricing?: {prompt?: unknown; completion?: unknown}}, descending = false) {
  const sum = (m: typeof a) => {const p=tokenPrices(m.pricing);return p.prompt == null || p.completion == null ? null : p.prompt+p.completion;};
  const x=sum(a),y=sum(b);
  if(x==null) return y==null?0:1;
  if(y==null) return -1;
  return descending?y-x:x-y;
}
export function distinctAnswer(content: string, reasoning: string) {
  const normalize=(s:string)=>s.trim().replace(/\s+/g," ");
  return reasoning.trim() && normalize(content)===normalize(reasoning) ? "" : content;
}
