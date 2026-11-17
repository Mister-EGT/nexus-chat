import { ArrowUpRight, Brain, Code2, GitCompareArrows, Globe, GraduationCap, Pencil, Search, Terminal } from "lucide-react";
import { createPortal } from "react-dom";
import { PromptSuggestion } from "./layro";
import { insertPrompt, studioAction, openStudioPage, setStarterMode } from "./nexus-engine.js";

export const starterPrompts = [
  { name: "Schreiben", description: "Einen Text klarer formulieren", body: "Überarbeite meinen Text für mehr Klarheit und Präzision. Behalte meine Aussage und meinen Ton bei. Mein Text: ", icon: Pencil },
  { name: "Entwickeln", description: "Code verstehen und verbessern", body: "Prüfe den folgenden Code. Erkläre Zweck und Datenfluss, finde konkrete Fehler und schlage gezielte Verbesserungen vor. Mein Code: ", icon: Code2 },
  { name: "Recherchieren", description: "Ein Thema gründlich erschließen", body: "Hilf mir bei der Recherche. Gliedere die wichtigsten Fragen, trenne gesicherte Aussagen von Unsicherheiten und nenne überprüfbare Quellen zu folgendem Thema: ", icon: Search },
  { name: "Lernen", description: "Schritt für Schritt durch ein Thema", body: "Erkläre mir dieses Thema verständlich mit einem konkreten Beispiel. Beginne mit den Grundlagen und gib mir anschließend eine kurze Übung, zunächst ohne Lösung. Mein Thema: ", icon: GraduationCap },
];

export function Welcome({ suggestions }: { suggestions: HTMLElement }) {
  return (
    <section className="workspace-welcome" aria-labelledby="workspace-title">
      <h1 id="workspace-title">Woran möchtest du weiterarbeiten?</h1>
      <p className="workspace-subtitle">Wähle ein Modell und bring deine nächste Aufgabe voran.</p>
      {createPortal(
        <div className="welcome-options"><div className="workspace-suggestions" aria-label="Prompt-Vorschläge">
          {starterPrompts.map(({ name, description, body, icon: Icon }) => (
            <PromptSuggestion key={name} aria-label={`${name} ${description}`} onClick={() => { const draft = (document.getElementById("msg-input") as HTMLTextAreaElement | null)?.value || ""; insertPrompt(draft.trim() ? body + draft : body); }}>
              <span className="suggestion-card-icon"><Icon size={18} aria-hidden="true" /></span>
              <span className="suggestion-card-copy"><strong>{name}</strong><small>{description}</small></span>
              <ArrowUpRight size={15} className="suggestion-card-arrow" aria-hidden="true" />
            </PromptSuggestion>
          ))}
        </div><nav className="welcome-tools" aria-label="Werkzeuge">
          <PromptSuggestion aria-label="Modelle vergleichen Zwei Antworten nebeneinander" onClick={() => openStudioPage("compare")}><span className="suggestion-card-icon"><GitCompareArrows size={18} /></span><span className="suggestion-card-copy"><strong>Modelle vergleichen</strong><small>Zwei Antworten nebeneinander</small></span><ArrowUpRight size={15} /></PromptSuggestion>
          <PromptSuggestion aria-label="Mit Denken Eine Aufgabe sorgfältig bearbeiten" onClick={() => setStarterMode("reasoning")}><span className="suggestion-card-icon"><Brain size={18} /></span><span className="suggestion-card-copy"><strong>Mit Denken</strong><small>Eine Aufgabe sorgfältig bearbeiten</small></span><ArrowUpRight size={15} /></PromptSuggestion>
          <PromptSuggestion aria-label="Mit Websuche Informationen mit Quellen finden" onClick={() => setStarterMode("web")}><span className="suggestion-card-icon"><Globe size={18} /></span><span className="suggestion-card-copy"><strong>Mit Websuche</strong><small>Informationen mit Quellen finden</small></span><ArrowUpRight size={15} /></PromptSuggestion>
          <PromptSuggestion aria-label="API-Explorer OpenRouter-Anfragen ausprobieren" onClick={() => studioAction("api")}><span className="suggestion-card-icon"><Terminal size={18} /></span><span className="suggestion-card-copy"><strong>API-Explorer</strong><small>OpenRouter-Anfragen ausprobieren</small></span><ArrowUpRight size={15} /></PromptSuggestion>
        </nav></div>,
        suggestions
      )}
    </section>
  );
}
