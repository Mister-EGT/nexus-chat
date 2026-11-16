import { ArrowUpRight, Brain, Calculator, Code2, FileText, ListChecks, PenLine, Search, ShieldCheck, Wrench, Check, ChevronDown, ChevronRight, Circle, Copy, FileDiff, Globe, LoaderCircle, Undo2, X } from "lucide-react";
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { describeThought, describeEvent, type ActivityEvent } from "./activity";
import { scrollImmediately } from "./stream-presentation";
import { type DiffDecision, type DiffFile } from "./diff";
import { copyText, renderMd, hardenLinks, parseReasoningSteps } from "./nexus-engine.js";
import type { Citation } from "./openrouter-sources";

export type Activity = { phase: "waiting" | "reasoning" | "search" | "tool" | "writing" | "done"; reasoning: boolean; demo: boolean; reasoningText?: string; aborted?: boolean; duration?: number; hasAnswer?: boolean; events?: ActivityEvent[] };

function WaveText({ text }: { text: string }) {
  return <span aria-hidden="true" className="layro-wave">{Array.from(text, (char, i) => <span key={i} style={{ "--wave-delay": `${i * 42}ms` } as CSSProperties}>{char}</span>)}</span>;
}

const ThoughtDetail = memo(function ThoughtDetail({ text }: { text: string }) {
  const html = useMemo(() => renderMd(text), [text]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => hardenLinks(root.current), [html]);
  return <div className="layro-step-detail msg-content" ref={root} dangerouslySetInnerHTML={{ __html: html }}/>;
});

// Adapted from Layro / @kokonut-labs/ai-loading (MIT).
// The same step rail displays received reasoning during streaming and in saved messages.
export function AILoading({ phase, reasoning, demo, reasoningText = "", aborted, duration, hasAnswer, events = [] }: Activity) {
  const done = phase === "done";
  const [seconds, setSeconds] = useState(0);
  const [open, setOpen] = useState(!done);
  const id = useId();
  const [roomy, setRoomy] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    if (list.current && follow.current && !roomy && !done) scrollImmediately(list.current, list.current.scrollHeight);
  }, [reasoningText, open, roomy, done]);
  useEffect(() => {
    if (done) return;
    const start = performance.now();
    const timer = setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [done]);
  const thoughts = reasoningText.trim() ? parseReasoningSteps(reasoningText) : [];
  const waiting = demo ? "Demo-Anfrage wird verarbeitet" : "Warte auf OpenRouter";
  const title = done ? aborted ? "Verarbeitung gestoppt" : "Verarbeitung abgeschlossen" : phase === "search" ? "Sucht im Internet" : phase === "tool" ? "Werkzeug aktiv" : phase === "reasoning" ? "Denkt nach" : phase === "writing" ? "Antwort wird geschrieben" : waiting;
  const icons = { reasoning: Brain, plan: ListChecks, calculate: Calculator, code: Code2, verify: ShieldCheck, summary: FileText, search: Search, fetch: Globe, tool: Wrench, sources: Globe, waiting: LoaderCircle, writing: PenLine };
  type Step = { id: string; label: string; detail: string; kind: keyof typeof icons; status: string };
  const steps: Step[] = thoughts.map((detail, i) => {
    const description = describeThought(detail, i);
    return { id: `thought-${i}`, ...description, kind: description.kind as keyof typeof icons, detail,
      status: !done && phase === "reasoning" && i === thoughts.length - 1 ? "läuft" : "abgeschlossen" };
  });
  steps.push(...events.map(event => ({ id: event.id, kind: event.kind, label: describeEvent(event, done), detail: event.detail || "",
    status: event.status === "requested" ? "angefordert" : event.status === "error" ? "fehlgeschlagen" : event.status === "running" ? done ? "gemeldet" : "läuft" : "abgeschlossen" })));
  if (!steps.length && !done) steps.push({ id: "waiting", kind: "waiting", label: waiting, detail: "", status: phase === "waiting" ? "läuft" : "abgeschlossen" });
  steps.push({ id: "writing", kind: "writing", label: done ? hasAnswer ? "Antwort erstellt" : aborted ? "Ausgabe gestoppt" : "Keine abschließende Antwort" : "Antwort wird geschrieben", detail: "", status: done ? "abgeschlossen" : phase === "writing" ? "läuft" : "ausstehend" });
  const elapsed = duration == null ? seconds : Math.round(duration / 1000);
  return <div className="layro-activity" data-phase={phase} data-reasoning={reasoning} data-roomy={roomy}>
    {!done && <output className="layro-sr-only">{title}</output>}
    <button type="button" className="layro-activity-head" aria-label={title} aria-controls={id} aria-expanded={open} onClick={() => setOpen(!open)}>
      {done ? aborted ? <X size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" /> : <span className="layro-loading-dots" aria-hidden="true"><i/><i/><i/></span>}
      {done ? <span>{title}</span> : <><span className="layro-sr-only">{title}</span><WaveText text={title} /></>}
      <span className="layro-activity-time">{elapsed > 0 ? `${elapsed} s` : ""}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && (thoughts.length > 0 || events.length > 0) && <button type="button" className="layro-thought-size" aria-expanded={roomy} onClick={() => setRoomy(!roomy)}>{roomy ? "Kompakter anzeigen" : "Denkverlauf vergrößern"}</button>}
    <ol id={id} ref={list} hidden={!open} aria-label="Denkverlauf" onScroll={() => {
      const node = list.current; if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    }}>
      {steps.map(({ id: key, label, detail, status, kind }) => {
        const Icon = icons[kind];
        return <li key={key} data-state={status} data-kind={kind}><span className="layro-step-icon"><Icon size={13} aria-hidden="true" /></span><div className="layro-step-body"><span className="layro-step-label">{label}<span className="layro-step-state">{status === "läuft" ? "Aktiv" : status === "angefordert" ? "Ausstehend" : status === "gemeldet" ? "Gemeldet" : status === "fehlgeschlagen" ? "Fehler" : ""}</span></span>{detail && <ThoughtDetail text={detail}/>}</div></li>;
      })}
    </ol>
  </div>;
}

// Adapted from Layro / @ibelick/source (MIT). The detail card uses API metadata and a local globe icon.
export function SourceLinks({ sources }: { sources: Citation[] }) {
  if (!sources.length) return null;
  return <section className="layro-source-list" aria-label="Quellen">
    <div className="layro-source-heading"><Globe size={14} aria-hidden="true" /> Quellen <span>{sources.length}</span></div>
    <ul>
      {sources.map((source) => <SourceLink key={source.url} source={source} />)}
    </ul>
  </section>;
}

function SourceLink({ source }: { source: Citation }) {
  const id = useId();
  const domain = new URL(source.url).hostname.replace(/^www\./, "");
  return <li className="layro-source">
    <a className="layro-source-trigger" href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${source.label} (${domain})`} aria-describedby={source.description ? id : undefined}>
      <Globe size={14} aria-hidden="true" /><span>{domain}</span><ArrowUpRight size={13} aria-hidden="true" />
    </a>
    <div className="layro-source-card" aria-hidden="true"><small>{domain}</small><strong>{source.label}</strong>{source.description ? <span>{source.description}</span> : null}</div>
    {source.description ? <span id={id} className="layro-sr-only">{source.description}</span> : null}
  </li>;
}

type Decisions = Record<number, DiffDecision>;

// Adapted from Layro / @kokonut-labs/ai-diff-review (MIT).
// Review actions record a per-file decision for this message.
export function AIDiffReview({ patch, files, initial, onDecision }: { patch: string; files: DiffFile[]; initial: Decisions; onDecision: (index: number, decision: DiffDecision) => void }) {
  const [decisions, setDecisions] = useState(initial);
  const [notice, setNotice] = useState("");
  const reviewed = files.filter((_, index) => decisions[index] && decisions[index] !== "pending").length;
  function decide(index: number, decision: DiffDecision) {
    setDecisions((current) => ({ ...current, [index]: decision }));
    onDecision(index, decision);
  }
  return <section className="layro-diff-review" aria-label="Diff-Review">
    <header><FileDiff size={17} aria-hidden="true" /><strong>Diff-Review</strong><span>{reviewed}/{files.length} geprüft</span>
      <button type="button" className="studio-icon-button" title="Patch kopieren" aria-label="Patch kopieren" onClick={async () => setNotice(await copyText(patch) ? "Patch kopiert" : "Kopieren fehlgeschlagen")}><Copy size={15} aria-hidden="true" /></button>
    </header>
    <ul>{files.map((file, index) => <FileReview key={index} file={file} index={index} decision={decisions[index] ?? "pending"} decide={(decision) => decide(index, decision)} />)}</ul>
    {notice ? <p className="layro-review-notice" role="status">{notice}</p> : null}
  </section>;
}

function FileReview({ file, index, decision, decide }: { file: DiffFile; index: number; decision: DiffDecision; decide: (decision: DiffDecision) => void }) {
  const [open, setOpen] = useState(index === 0 && file.hunks.length > 0);
  const id = useId();
  const rows = file.hunks.flatMap(({ lines }) => lines);
  const added = rows.filter(({ type }) => type === "add").length;
  const removed = rows.filter(({ type }) => type === "remove").length;
  const greenBlocks = Math.round(5 * added / Math.max(1, added + removed));
  const status = decision === "accepted" ? "Akzeptiert" : decision === "rejected" ? "Abgelehnt" : "Offen";
  return <li className="layro-diff-file" data-decision={decision}>
    <div className="layro-diff-file-head">
      <button type="button" className="layro-diff-toggle" aria-controls={id} aria-expanded={open} title={file.path} onClick={() => setOpen(!open)}>
        <ChevronRight size={15} aria-hidden="true" /><span>{file.path}</span>
      </button>
      <span className="layro-diff-status" role="status">{status}</span>
      <span className="layro-diff-count"><span>+{added}</span><span>−{removed}</span></span>
      <span className="layro-change-bar" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} data-kind={added + removed ? i < greenBlocks ? "add" : "remove" : "context"} />)}</span>
      <div className="layro-diff-actions">
        <button type="button" className="studio-icon-button" aria-label={`${file.path} ablehnen`} aria-pressed={decision === "rejected"} onClick={() => decide(decision === "rejected" ? "pending" : "rejected")}><X size={15} aria-hidden="true" /></button>
        <button type="button" className="studio-icon-button" aria-label={`${file.path} akzeptieren`} aria-pressed={decision === "accepted"} onClick={() => decide(decision === "accepted" ? "pending" : "accepted")}><Check size={15} aria-hidden="true" /></button>
        {decision !== "pending" ? <button type="button" className="studio-icon-button" aria-label={`Entscheidung für ${file.path} zurücksetzen`} onClick={(event) => {
          event.currentTarget.previousElementSibling instanceof HTMLElement && event.currentTarget.previousElementSibling.focus();
          decide("pending");
        }}><Undo2 size={14} aria-hidden="true" /></button> : null}
      </div>
    </div>
    <div id={id} className="layro-diff-content" hidden={!open}>
      {file.kind !== "modified" ? <div className="layro-diff-heading">{file.kind === "created" ? "Neue Datei" : "Datei gelöscht"}</div> : null}
      {file.hunks.map((hunk, hunkIndex) => {
        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        return <div key={hunkIndex}>
          {hunk.heading ? <div className="layro-diff-heading">{hunk.heading}</div> : null}
          {hunk.lines.map((line, rowIndex) => {
            const old = line.type === "context" || line.type === "remove" ? oldLine : null;
            const next = line.type === "context" || line.type === "add" ? newLine : null;
            if (old !== null) oldLine = old + 1;
            if (next !== null) newLine = next + 1;
            return <div key={rowIndex} className="layro-diff-line" data-kind={line.type}>
              <span aria-hidden="true">{old}</span><span aria-hidden="true">{next}</span>
              <span>{line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}</span><code>{line.text || " "}</code>
            </div>;
          })}
        </div>;
      })}
    </div>
  </li>;
}
