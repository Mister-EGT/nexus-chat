import { ArrowUp, Brain, BookOpen, ChevronDown, Globe, Mic, Paperclip, Plus, Settings2, Square, Terminal } from "lucide-react";
import { platformModifier } from "./theme";
import { useEffect, useRef, useState } from "react";

export type ComposerProps = {
  accept: string | null;
  webSearch: boolean;
  reasoning: { mode: string; title: string; open: boolean } | null;
  onToggleWeb: () => boolean;
  onOptions: () => void;
  onExplorer: () => void;
  onPrompts: () => void;
};

// Adapted from Layro / @kokonut-labs/ai-input-search (MIT).
// Prompt surface and send/stop styling also adapted from
// Layro / @kokonut-labs/ai-prompt (MIT), without demo replies.
// The input and send/stop are driven by Nexus's existing chat engine.
export function AIInputSearch({ accept, reasoning, webSearch, onToggleWeb, onOptions, onExplorer, onPrompts }: ComposerProps) {
  const tools = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [web, setWeb] = useState(webSearch);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (tools.current?.open && event.target instanceof Node && !tools.current.contains(event.target)) tools.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  function select(action: () => void) {
    if (tools.current) tools.current.open = false;
    summary.current?.focus({ preventScroll: true });
    action();
  }

  return (
    <div className="chat-input-wrap layro-input-search">
      <div className="chat-input-box layro-input-frame" id="input-box">
        <div className="attached-preview" id="attached-preview" style={{ display: "none" }} />
        <textarea id="msg-input" rows={1} aria-label="Nachricht eingeben" placeholder="Schreibe eine Nachricht …" />
        <div className="layro-input-toolbar" role="group" aria-label="Chat-Werkzeuge">
          {accept !== null ? <button className="layro-input-icon" id="btn-attach" type="button" title="Datei anhängen" aria-label="Datei anhängen"><Paperclip size={18} aria-hidden="true" /></button> : null}
          <details className="layro-tool-picker" ref={tools} onBlur={(event) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
          }} onKeyDown={(event) => {
            if (event.key === "Escape" && event.currentTarget.open) {
              event.preventDefault();
              select(() => {});
            }
          }}>
            <summary ref={(node) => { summary.current = node; }} className="layro-tool-pill" aria-label="Weitere Werkzeuge" title="Weitere Werkzeuge">
              <Plus size={19} aria-hidden="true" />
            </summary>
            <div className="layro-tool-menu">
              {accept !== null ? <button className="mobile-attachment-action" type="button" onClick={() => select(() => document.getElementById("btn-attach")?.click())}><Paperclip size={16} aria-hidden="true" /><span>Datei anhängen</span></button> : null}
              <button type="button" onClick={() => select(onPrompts)}><BookOpen size={16} aria-hidden="true" /><span>Prompt-Bibliothek</span></button>
              <button id="btn-chat-options" type="button" onClick={() => select(onOptions)}><Settings2 size={16} aria-hidden="true" /><span>Chat-Optionen</span></button>
              <button id="btn-openrouter" type="button" onClick={() => select(onExplorer)}><Terminal size={16} aria-hidden="true" /><span>OpenRouter API-Explorer</span></button>
              <button id="btn-slash" type="button" onClick={() => { if (tools.current) tools.current.open = false; }}><Terminal size={16} aria-hidden="true" /><span>Slash-Befehl starten</span></button>
            </div>
          </details>
          <button id="btn-web-search" className={`layro-web-toggle${web ? " active" : ""}`} type="button" aria-pressed={web} title={web ? "Websuche deaktivieren" : "Websuche aktivieren (kann Kosten verursachen)"} onClick={() => setWeb(onToggleWeb())}><Globe size={15} aria-hidden="true" /><span>Websuche</span></button>
          {reasoning ? <div className="reasoning-wrap">
            <button className={reasoning.mode === "off" ? "reasoning-btn" : "reasoning-btn active"} id="btn-reasoning" type="button" title={reasoning.title} aria-label={`Denken: ${reasoning.mode === "off" ? "Aus" : reasoning.mode === "auto" ? "Auto" : "An"}`} aria-haspopup="menu" aria-expanded={reasoning.open} aria-pressed={reasoning.mode !== "off"}>
              <Brain size={15} aria-hidden="true" /><span>Denken: {reasoning.mode === "off" ? "Aus" : reasoning.mode === "auto" ? "Auto" : "An"}</span>
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </div> : null}
          <span className="layro-input-spacer" />
          <button className="dictate-btn layro-input-icon" id="btn-dictate" type="button" title="Diktat starten" aria-label="Diktat starten"><Mic size={16} aria-hidden="true" /></button>
          <button className="send-btn" id="btn-send" type="button" disabled aria-label="Nachricht senden"><ArrowUp size={19} className="layro-send-icon" aria-hidden="true" /><Square size={15} className="layro-stop-icon" aria-hidden="true" /></button>
        </div>
      </div>
      <div className="input-info"><div id="context-meter" /><span className="composer-key-hint"><kbd>Enter</kbd> senden <span>·</span> <kbd>Umschalt Enter</kbd> neue Zeile <span>·</span> <kbd>{platformModifier()} K</kbd> Aktionen</span><span className="tokens" id="input-tokens">~0 tok</span></div>
      {accept !== null ? <input type="file" id="file-input" accept={accept} hidden multiple /> : null}
    </div>
  );
}

