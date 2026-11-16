import { citationSources } from './openrouter-sources.ts';
export type ActivityKind = 'search' | 'fetch' | 'tool' | 'sources';
export type ActivityEvent = { id: string; kind: ActivityKind; status: 'requested' | 'running' | 'done' | 'error'; detail?: string; count?: number };
type RecordValue = Record<string, any>;
const object = (value: unknown): RecordValue => value && typeof value === 'object' ? value as RecordValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const short = (value: unknown) => typeof value === 'string' ? value.slice(0, 350) : '';
export function collectActivity(payload: unknown, calls: unknown[] = []): ActivityEvent[] {
  const p = object(payload), choice = object(array(p.choices)[0]), delta = object(choice.delta || choice.message);
  const items = [...calls, ...array(p.output), ...(p.item ? [p.item] : [])];
  // Explicit provider events, never guesses from the model's prose.
  if (/^response\.(web_search_call|web_fetch_call)\./.test(p.type || '')) items.push({ id: p.item_id, type: p.type.includes('web_search') ? 'web_search_call' : 'web_fetch_call', status: p.type.split('.').pop() });
  const events: ActivityEvent[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = object(items[i]), fn = object(item.function), name = String(fn.name || item.name || item.type || '');
    if (!name || name === 'function') continue;
    const kind: ActivityKind = /(?:web[_:]?search|browser[_:]?search|search_web)/i.test(name) ? 'search' : /(?:web[_:]?fetch|browse|fetch_url)/i.test(name) ? 'fetch' : 'tool';
    const explicit = /^(web_search_call|web_fetch_call)$/.test(item.type || '');
    const status: ActivityEvent['status'] = explicit && /^(completed|done)$/.test(item.status) ? 'done' : explicit && /^(in_progress|searching|running)$/.test(item.status) ? 'running' : explicit && /^(failed|error)$/.test(item.status) ? 'error' : 'requested';
    let args = object(item.action);
    if (typeof fn.arguments === 'string') { try { args = object(JSON.parse(fn.arguments)); } catch {} }
    events.push({ id: String(item.id || `tool-${item.index ?? i}`), kind, status, detail: short(args.query || args.search_query || args.url || (kind === 'tool' ? name : '')) });
  }
  const sources = citationSources([...array(delta.annotations), ...array(p.annotations)]);
  if (sources.length) events.push({ id: 'sources', kind: 'sources', status: 'done', count: sources.length, detail: sources.map(s => new URL(s.url).hostname).filter((s,i,a)=>a.indexOf(s)===i).join(' · ').slice(0,350) });
  const use = object(object(p.usage).server_tool_use);
  const count = Number(use.web_search_requests);
  if (Number.isFinite(count) && count > 0) events.push({ id: 'search-usage', kind: 'search', status: 'done', count });
  return events;
}
export function mergeActivity(previous: ActivityEvent[], next: ActivityEvent[]) {
  const map = new Map(previous.map(e=>[e.id,e]));
  for (const event of next) map.set(event.id, { ...map.get(event.id), ...event });
  return [...map.values()];
}
export function describeThought(text: string, index: number) {
  const heading = text.split('\n').find(line=>line.trim())?.replace(/^\s*(?:#{1,6}\s*|\d+[.)]\s*)/, '').replace(/[*_`]/g,'').replace(/:\s*$/, '').trim() || '';
  const sample = (heading || text).toLowerCase();
  const kind = /prüf|check|verif|valid|test/.test(sample) ? 'verify' : /rechn|berechn|calculat|math|equation|\d+\s*[+*=]/.test(sample) ? 'calculate' : /code|implement|programm|debug/.test(sample) ? 'code' : /plan|vorgehen|struktur|approach/.test(sample) ? 'plan' : /zusammenfass|schluss|synthes|conclu|summari/.test(sample) ? 'summary' : 'reasoning';
  const fallback = {verify:'Prüfen',calculate:'Berechnen',code:'Code durchgehen',plan:'Vorgehen planen',summary:'Ergebnis zusammenführen',reasoning:`Gedankenschritt ${index + 1}`};
  return { kind, label: heading.length <= 78 && /^(?:\s*#{1,6}\s|\s*\d+[.)]\s|\s*\*\*)/.test(text) ? heading : fallback[kind] };
}
export function describeEvent(event: ActivityEvent, finished = false) {
  if (event.kind === 'sources') return `${event.count || ''} Quellen erhalten`.trim();
  const task = event.kind === 'search' ? 'Websuche' : event.kind === 'fetch' ? 'Seitenabruf' : 'Werkzeug';
  if (event.status === 'requested') return `${task} angefordert`;
  if (event.status === 'error') return `${task} fehlgeschlagen`;
  if (event.status === 'done') return event.count ? `${event.count} ${event.count === 1 ? "Websuche" : "Websuchen"} ausgeführt` : `${task} abgeschlossen`;
  return finished ? `${task} gemeldet` : event.kind === 'search' ? 'Sucht im Internet' : `${task} läuft`;
}
