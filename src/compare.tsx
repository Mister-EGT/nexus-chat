import { ArrowLeftRight, Copy, GitCompareArrows, Plus, Search, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BobbingDots } from "./layro";
import { mountDiffs } from "./layro-bridge";
import { SourceLinks } from "./layro-response";
import { compareAnswer, comparisonModels, copyText, hardenLinks, renderMd, saveComparison, type ComparisonAnswer, type ModelOption } from "./nexus-engine.js";

type Result = { model: string; answer?: ComparisonAnswer; error?: string; loading?: boolean };
const costFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 6 });

function ComparisonPreview({ content, sources }: Pick<ComparisonAnswer, "content" | "sources">) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!node.current) return;
    hardenLinks(node.current);
    return mountDiffs(node.current);
  }, [content]);
  return <>
    <div ref={node} className="msg-content studio-answer" dangerouslySetInnerHTML={{ __html: renderMd(content) }} />
    {sources?.length ? <SourceLinks sources={sources} /> : null}
  </>;
}

function ModelField({ name, value, setValue, models, disabled }: { name: string; value: string; setValue: (value: string) => void; models: ModelOption[]; disabled: boolean }) {
  return <label>{name}<select value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)}>
    {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
  </select></label>;
}

export function ComparePanel({ onSaved }: { onSaved: () => void }) {
  const [{ models, selected, demo, draft }] = useState(comparisonModels);
  const [modelQuery, setModelQuery] = useState("");
  const [modelA, setModelA] = useState(() => models.some(({ id }) => id === selected) ? selected! : models[0]?.id ?? "");
  const [modelB, setModelB] = useState(() => models.find(({ id }) => id !== modelA)?.id ?? "");
  const [prompt, setPrompt] = useState(draft ?? "");
  const [runPrompt, setRunPrompt] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const running = results.some((result) => result.loading);

  useEffect(() => () => controller.current?.abort(), []);

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
        result = { model, answer: await compareAnswer(model, text, request.signal) };
      } catch (error) {
        result = { model, error: request.signal.aborted ? "Abgebrochen." : error instanceof Error ? error.message : "Die Anfrage ist fehlgeschlagen." };
      }
      if (controller.current === request) setResults((previous) => previous.map((item) => item.model === model ? result : item));
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
  const matchingModels = models.filter((model) => [modelA, modelB].includes(model.id) || `${model.name} ${model.id}`.toLocaleLowerCase("de").includes(modelQuery.toLocaleLowerCase("de")));
  return (
    <>
      <form className="studio-form" onSubmit={run}>
        {models.length > 12 ? <label className="studio-search compare-model-search"><Search size={16} aria-hidden="true" /><input value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder="Modelle für den Vergleich filtern" aria-label="Vergleichsmodelle filtern" /></label> : null}
        <div className="compare-model-pair">
          <ModelField name="Modell A" value={modelA} setValue={setModelA} models={matchingModels} disabled={running} />
          <button type="button" className="studio-icon-button compare-swap" disabled={running} aria-label="Modelle tauschen" title="Modelle tauschen" onClick={() => { setModelA(modelB); setModelB(modelA); }}><ArrowLeftRight size={18} /></button>
          <ModelField name="Modell B" value={modelB} setValue={setModelB} models={matchingModels} disabled={running} />
        </div>
        <label>Gemeinsamer Prompt<textarea rows={3} maxLength={16000} value={prompt} disabled={running} onChange={(event) => setPrompt(event.target.value)} placeholder="Was möchtest du beiden Modellen fragen?" /></label>
        <div className="studio-form-footer">
          <small>{demo ? "Demo mit simulierten Antworten." : "Zwei eigenständige Anfragen an OpenRouter. Es können Kosten anfallen."}</small>
          {running ? <button className="studio-button" type="button" onClick={() => controller.current?.abort()}><Square size={14} /> Stoppen</button> :
            <button className="studio-button primary" type="submit" disabled={!prompt.trim() || modelA === modelB}><GitCompareArrows size={16} /> Antworten vergleichen</button>}
        </div>
        {modelA === modelB ? <p className="studio-note">Wähle zwei unterschiedliche Modelle.</p> : null}
      </form>
      {results.length ? <div className="studio-results studio-grid-two" aria-live="polite">
        {results.map((result, index) => {
          const answer = result.answer;
          return <article key={result.model} className="studio-result">
            <header><span className="studio-tag">{index ? "B" : "A"}</span><h3>{models.find(({ id }) => id === result.model)?.name || result.model}</h3></header>
            {result.loading ? <div className="studio-loading"><BobbingDots /><span>Antwort wird geladen</span></div> : null}
            {result.error ? <p className="studio-note error">{result.error}</p> : null}
            {answer ? <>
              <ComparisonPreview content={answer.content} sources={answer.sources} />
              <p className="studio-result-meta">{(answer.duration / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s · {answer.promptTokens + answer.completionTokens} Token · {costFormat.format(answer.cost)}</p>
              <div className="studio-result-actions">
                <button className="studio-button" type="button" onClick={async () => setNotice(await copyText(answer.content) ? "Antwort kopiert." : "Kopieren nicht möglich.")}><Copy size={15} /> Kopieren</button>
                <button className="studio-button" type="button" onClick={() => keep(answer)}><Plus size={15} /> Als Chat öffnen</button>
              </div>
            </> : null}
          </article>;
        })}
      </div> : null}
      {notice ? <p className="studio-note" role="status">{notice}</p> : null}
    </>
  );
}
