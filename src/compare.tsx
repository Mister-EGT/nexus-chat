import { ModelPicker } from "./model-picker";
import { ArrowLeftRight, Copy, GitCompareArrows, Plus, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { BobbingDots } from "./layro";
import { mountDiffs } from "./layro-bridge";
import { SourceLinks } from "./layro-response";
import { compareAnswer, comparisonModels, copyText, updateComparisonView, saveComparison, type ComparisonAnswer } from "./nexus-engine.js";

type Result = { model: string; answer?: ComparisonAnswer; error?: string; loading?: boolean };
const costFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 6 });

function ComparisonPreview({ content, sources, completed }: Pick<ComparisonAnswer, "content" | "sources"> & { completed: boolean }) {
  const node = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (node.current) updateComparisonView(node.current, content, completed);
  }, [content, completed]);
  useEffect(() => { if (node.current && completed) return mountDiffs(node.current); }, [completed]);
  return <>
    <div ref={node} className="msg-content studio-answer" />
    {sources?.length ? <SourceLinks sources={sources} /> : null}
  </>;
}

export function ComparePanel({ onSaved }: { onSaved: () => void }) {
  const [{ models, selected, demo, draft }] = useState(comparisonModels);
  const [elapsed, setElapsed] = useState(0);
  const [modelA, setModelA] = useState(() => models.some(({ id }) => id === selected) ? selected! : models[0]?.id ?? "");
  const [modelB, setModelB] = useState(() => models.find(({ id }) => id !== modelA)?.id ?? "");
  const [prompt, setPrompt] = useState(draft ?? "");
  const [runPrompt, setRunPrompt] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const running = results.some((result) => result.loading);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (!running) return; const start = performance.now(); const timer = setInterval(() => setElapsed(performance.now() - start), 100); return () => clearInterval(timer); }, [running]);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || modelA === modelB || !modelA || !modelB || controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setNotice("");
    setRunPrompt(text);
    const ids = [modelA, modelB];
    setResults(ids.map((model) => ({ model, loading: true })));
    await Promise.all(ids.map(async (model) => {
      let result: Result;
      try {
        result = { model, answer: await compareAnswer(model, text, request.signal, answer => {
          if (controller.current === request) setResults(previous => previous.map(item => item.model === model ? { model, answer, loading: true } : item));
        }) };
      } catch (error) {
        result = { model, error: request.signal.aborted ? "Abgebrochen." : error instanceof Error ? error.message : "Die Anfrage ist fehlgeschlagen." };
      }
      if (controller.current === request) setResults((previous) => previous.map((item) => item.model === model ? { ...item, ...result, loading: false } : item));
    }));
    if (controller.current === request) controller.current = null;
  }

  function keep(answer: ComparisonAnswer) {
    try {
      saveComparison(runPrompt, answer);
      onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Chat konnte nicht gespeichert werden.");
    }
  }

  if (models.length < 2) return <p className="studio-note">Für den Vergleich müssen mindestens zwei Textmodelle verfügbar sein. Lade die Modellliste in den Einstellungen neu.</p>;
  const complete = results.length === 2 && results.every(item => item.answer && !item.loading && !item.error);
  const fastest = complete ? Math.min(...results.map(item => item.answer!.duration)) : null;
  const cheapest = complete ? Math.min(...results.map(item => item.answer!.cost)) : null;
  return (
    <>
      <form className="studio-form" onSubmit={run}>
        <div className="compare-model-pair">
          <ModelPicker label="Modell A" value={modelA} onChange={setModelA} models={models} disabled={running} />
          <button type="button" className="studio-icon-button compare-swap" disabled={running} aria-label="Modelle tauschen" title="Modelle tauschen" onClick={() => { setModelA(modelB); setModelB(modelA); }}><ArrowLeftRight size={18} /></button>
          <ModelPicker label="Modell B" value={modelB} onChange={setModelB} models={models} disabled={running} />
        </div>
        <label>Gemeinsamer Prompt<textarea rows={3} maxLength={16000} value={prompt} disabled={running} onChange={(event) => setPrompt(event.target.value)} placeholder="Was möchtest du beiden Modellen fragen?" /></label>
        <div className="studio-form-footer">
          <small>{demo ? "Demo mit simulierten Antworten." : "Zwei eigenständige Anfragen an OpenRouter. Es können Kosten anfallen."}</small>
          {running ? <button className="studio-button" type="button" onClick={() => controller.current?.abort()}><Square size={14} /> Stoppen</button> :
            <button className="studio-button primary" type="submit" disabled={!prompt.trim() || modelA === modelB}><GitCompareArrows size={16} /> Antworten vergleichen</button>}
        </div>
        {modelA === modelB ? <p className="studio-note">Wähle zwei unterschiedliche Modelle.</p> : null}
      </form>
      {results.length ? <div className="studio-results studio-grid-two">
        {results.map((result, index) => {
          const answer = result.answer;
          return <article key={result.model} className="studio-result">
            <header><span className="studio-tag">{index ? "B" : "A"}</span><h3>{models.find(({ id }) => id === result.model)?.name || result.model}</h3>
              <div className="compare-live-metrics"><span>{((result.loading ? elapsed : answer?.duration ?? 0) / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s</span><span>{answer ? `${answer.promptTokens + answer.completionTokens} Token${result.loading ? " ~" : ""}` : "Token ausstehend"}</span><span>{answer && !result.loading ? costFormat.format(answer.cost) : "Kosten ausstehend"}</span></div>
              {answer && complete ? <div className="compare-award">{answer.duration === fastest ? "Schnellste Antwort" : ""}{answer.duration === fastest && answer.cost === cheapest ? " · " : ""}{answer.cost === cheapest ? results.every(item => item.answer?.cost === cheapest) ? "Gleich günstig" : "Günstigste Antwort" : ""}</div> : null}
            </header>
            {result.loading ? <div className="studio-loading"><BobbingDots /><span>Antwort wird geladen</span></div> : null}
            {result.error ? <p className="studio-note error">{result.error}</p> : null}
            {answer ? <>
              <ComparisonPreview content={answer.content} sources={answer.sources} completed={!result.loading} />
              {!result.loading && !result.error ? <div className="studio-result-actions">
                <button className="studio-button" type="button" onClick={async () => setNotice(await copyText(answer.content) ? "Antwort kopiert." : "Kopieren nicht möglich.")}><Copy size={15} /> Kopieren</button>
                <button className="studio-button" type="button" onClick={() => keep(answer)}><Plus size={15} /> Als Chat öffnen</button>
              </div> : null}
            </> : null}
          </article>;
        })}
      </div> : null}
      {notice ? <p className="studio-note" role="status">{notice}</p> : null}
    </>
  );
}
