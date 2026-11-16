import { useEffect, useId, useRef, useState } from "react";
import { contextTotals, type ContextSnapshot } from "./context";
const fmt = (n: number) => Math.round(n).toLocaleString("de-DE");
// Adapted from @kokonut-labs/ai-context-meter (MIT), Layro v1.0.0.
// Controlled data only: no demo growth, simulated compaction or invented usage.
export function AIContextMeter({ snapshot }: { snapshot: ContextSnapshot }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { used, limit, free, share } = contextTotals(snapshot);
  useEffect(() => {
    if (!open) return;
    const pointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); };
  }, [open]);
  return <div className="layro-context" ref={root} data-level={share >= 1 ? "full" : share >= .8 ? "high" : "normal"}>
    <button ref={trigger} type="button" className="layro-context-trigger" aria-controls={id} aria-expanded={open} aria-label={`Kontext: ${limit ? `${Math.round(share * 100)} Prozent belegt` : "Limit unbekannt"}. Details anzeigen`} onClick={() => setOpen(!open)}>
      <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" className="context-ring-track"/><circle cx="8" cy="8" r="6" strokeDasharray={Math.PI * 12} strokeDashoffset={Math.PI * 12 * (1 - Math.min(1, share))}/></svg>
      <span>Kontext {limit ? `${Math.round(share * 100)} %` : "unbekannt"}</span><span className="context-estimate">geschätzt</span>
    </button>
    {open && <section id={id} className="layro-context-panel" aria-label="Kontextdetails">
      <header><strong>Kontextfenster</strong><span>~{fmt(used)} / {limit ? fmt(limit) : "unbekannt"}</span></header>
      <p>{snapshot.model}</p>
      <div className="context-segments" aria-hidden="true">{snapshot.segments.map((s, i) => <span key={s.id} style={{ width: `${limit ? Math.max(0, s.tokens) / Math.max(limit, used) * 100 : 0}%`, "--segment": i } as React.CSSProperties}/>)}</div>
      <ul>{snapshot.segments.map((s, i) => <li key={s.id}><i style={{ "--segment": i } as React.CSSProperties}/><span>{s.label}</span><span>~{fmt(s.tokens)}</span></li>)}{limit > 0 && <li><i className="context-free"/><span>Verfügbar</span><span>~{fmt(free)}</span></li>}</ul>
      {snapshot.warning && <p className="context-warning">{snapshot.warning}</p>}
      {(snapshot.omitted > 0 || snapshot.clipped > 0) && <p className="context-warning">{snapshot.omitted} Nachrichten ausgelassen · {snapshot.clipped} gekürzt</p>}
      {snapshot.lastUsage && <div className="context-api-usage"><strong>{snapshot.demo ? "Letzte Demo-Antwort" : "Letzte gemeldete OpenRouter-Nutzung"}</strong><span>Eingabe: {fmt(snapshot.lastUsage.prompt)} · Ausgabe: {fmt(snapshot.lastUsage.completion)}</span><span>Davon Reasoning: {snapshot.lastUsage.reasoning == null ? "nicht gemeldet" : fmt(snapshot.lastUsage.reasoning)}</span></div>}
    </section>}
  </div>;
}
