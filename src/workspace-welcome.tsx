import { ArrowUpRight, Code2, GraduationCap, Pencil, Search } from "lucide-react";
import { createPortal } from "react-dom";
import { PromptSuggestion } from "./layro";
import { insertPrompt } from "./nexus-engine.js";

export const starterPrompts = [
  { name: "Schreiben", description: "Einen Text klarer formulieren", body: "Überarbeite meinen Text für mehr Klarheit und Präzision. Behalte meine Aussage und meinen Ton bei. Mein Text: ", icon: Pencil },
  { name: "Entwickeln", description: "Code verstehen und verbessern", body: "Prüfe den folgenden Code. Erkläre Zweck und Datenfluss, finde konkrete Fehler und schlage gezielte Verbesserungen vor. Mein Code: ", icon: Code2 },
  { name: "Recherchieren", description: "Ein Thema gründlich erschließen", body: "Hilf mir bei der Recherche. Gliedere die wichtigsten Fragen, trenne gesicherte Aussagen von Unsicherheiten und nenne überprüfbare Quellen zu folgendem Thema: ", icon: Search },
  { name: "Lernen", description: "Schritt für Schritt durch ein Thema", body: "Erkläre mir dieses Thema verständlich mit einem konkreten Beispiel. Beginne mit den Grundlagen und gib mir anschließend eine kurze Übung, zunächst ohne Lösung. Mein Thema: ", icon: GraduationCap },
];

export function Welcome({ suggestions }: { suggestions: HTMLElement }) {
  return (
    <section className="workspace-welcome" aria-labelledby="workspace-title">
      <p className="workspace-eyebrow">Nexus Chat Studio</p>
      <h1 id="workspace-title">Ein neuer Chat</h1>
      <p className="workspace-subtitle">Texte überarbeiten, Code prüfen oder Themen verstehen.</p>
      {createPortal(
        <div className="workspace-suggestions" aria-label="Prompt-Vorschläge">
          {starterPrompts.map(({ name, description, body, icon: Icon }) => (
            <PromptSuggestion key={name} onClick={() => insertPrompt(body)}>
              <span className="suggestion-card-icon"><Icon size={18} aria-hidden="true" /></span>
              <span className="suggestion-card-copy"><strong>{name}</strong><small>{description}</small></span>
              <ArrowUpRight size={15} className="suggestion-card-arrow" aria-hidden="true" />
            </PromptSuggestion>
          ))}
        </div>,
        suggestions
      )}
    </section>
  );
}
