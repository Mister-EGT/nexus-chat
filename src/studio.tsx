import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, BookOpen, Command, Cpu, Eye, EyeOff, FileJson, GitCompareArrows, Globe2, KeyRound, Pencil, Plus, Search, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { CommandPalette } from "./layro-command";
import { ComparePanel } from "./compare";
import { starterPrompts } from "./workspace-welcome";
import { PromptSuggestion } from "./layro";
import { connectNexus, downloadChats, insertPrompt, mergeChats, commandChats, openStudioChat, studioAction, type StudioAction, type StudioPage } from "./nexus-engine.js";
import { readNexusExport } from "./transfer";

const pages = {
  command: { title: "Schnellaktionen", description: "Wechsle zwischen Werkzeugen oder springe zu einer Aktion.", icon: Command },
  compare: { title: "Modellvergleich", description: "Ein Prompt, zwei Antworten. Vergleiche Inhalt, Tempo und Verbrauch.", icon: GitCompareArrows },
  prompts: { title: "Prompt-Bibliothek", description: "Verwende Vorlagen oder speichere eigene Prompts für später.", icon: BookOpen },
  transfer: { title: "Chat-Transfer", description: "Importiere frühere Gespräche oder exportiere deine Chat-Sammlung.", icon: FileJson },
  connect: { title: "OpenRouter verbinden", description: "Verbinde deinen API-Key, um echte Modellantworten zu erhalten.", icon: KeyRound },
};

function ConnectPanel({ close }: { close: () => void }) {
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!key.trim() || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      await connectNexus(key.trim(), remember, controller.signal);
      if (!controller.signal.aborted) close();
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Die Verbindung ist fehlgeschlagen.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <form className="studio-form workspace-connect-form" onSubmit={submit}>
    <label htmlFor="api-key-input">OpenRouter API-Key</label>
    <div className="workspace-key-field">
      <input id="api-key-input" autoFocus type={visible ? "text" : "password"} autoComplete="off" spellCheck={false} value={key} disabled={busy} placeholder="sk-or-v1-…" onChange={(event) => setKey(event.target.value)} />
      <button type="button" className="studio-icon-button" aria-label={visible ? "API-Key verbergen" : "API-Key anzeigen"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
    <label className="workspace-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} /> Key auf diesem Gerät speichern</label>
    {error ? <p className="studio-note error" role="alert">{error}</p> : null}
    <button className="studio-button primary" type="submit" disabled={busy || !key.trim()}>{busy ? "Verbindung wird geprüft …" : "Verbinden"}</button>
    <a className="workspace-key-link" href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">API-Key bei OpenRouter erstellen <ArrowUpRight size={14} aria-hidden="true" /></a>
  </form>;
}

type Prompt = { id: string; name: string; body: string };
const promptStorageKey = "nexus_studio_prompts_v1";

function getPrompts(): Prompt[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(promptStorageKey) ?? "[]");
    return Array.isArray(stored) ? stored.filter((item): item is Prompt => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.body === "string") : [];
  } catch {
    return [];
  }
}

function PromptPanel({ close }: { close: () => void }) {
  const [custom, setCustom] = useState(getPrompts);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [edit, setEdit] = useState<string>();
  const [notice, setNotice] = useState("");
  const nameField = useRef<HTMLInputElement>(null);
  const normalized = query.trim().toLocaleLowerCase("de");
  const includes = (item: { name: string; body: string }) => `${item.name} ${item.body}`.toLocaleLowerCase("de").includes(normalized);
  const presets = starterPrompts.filter(includes);
  const own = custom.filter(includes);

  function persist(next: Prompt[]) {
    try {
      localStorage.setItem(promptStorageKey, JSON.stringify(next));
      setCustom(next);
      setNotice("");
      return true;
    } catch {
      setNotice("Dein Browser konnte die Vorlagen nicht speichern.");
      return false;
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !body.trim()) return;
    const next = { id: edit ?? crypto.randomUUID(), name: name.trim(), body: body.trim() };
    if (persist(edit ? custom.map((item) => item.id === edit ? next : item) : [next, ...custom])) {
      setName("");
      setBody("");
      setEdit(undefined);
      setNotice("Vorlage gespeichert.");
    }
  }

  function usePrompt(text: string) {
    if (insertPrompt(text)) close();
    else setNotice("Warte auf die laufende Chat-Antwort oder stoppe sie.");
  }

  return <div className="studio-library">
    <div className="studio-library-list">
      <label className="studio-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Vorlagen durchsuchen" aria-label="Vorlagen durchsuchen" /></label>
      {presets.length ? <><h3>Startpunkte <span>{presets.length}</span></h3>{presets.map((item) =>
        <div className="studio-prompt-row" key={item.name}>
          <PromptSuggestion onClick={() => usePrompt(item.body)}><span className="prompt-preview-copy"><strong>{item.name}</strong><small>{item.body}</small></span><ArrowUpRight size={16} aria-hidden="true" /></PromptSuggestion>
        </div>)}</> : null}
      {own.length ? <><h3>Deine Vorlagen</h3>{own.map((item) =>
        <div className="studio-prompt-row" key={item.id}>
          <PromptSuggestion onClick={() => usePrompt(item.body)}><span className="prompt-preview-copy"><strong>{item.name}</strong><small>{item.body}</small></span></PromptSuggestion>
          <button className="studio-icon-button" type="button" aria-label={`${item.name} bearbeiten`} onClick={() => { setEdit(item.id); setName(item.name); setBody(item.body); nameField.current?.focus(); }}><Pencil size={15} /></button>
          <button className="studio-icon-button" type="button" aria-label={`${item.name} löschen`} onClick={() => {
            if (persist(custom.filter(({ id }) => id !== item.id)) && edit === item.id) { setEdit(undefined); setName(""); setBody(""); }
          }}><Trash2 size={15} /></button>
        </div>)}</> : null}
      {!presets.length && !own.length ? <p className="studio-note">Keine passenden Vorlagen.</p> : null}
    </div>
    <form className="studio-form studio-prompt-form" onSubmit={save}>
      <h3>{edit ? "Vorlage bearbeiten" : "Neue Vorlage"}</h3>
      <label>Name<input ref={nameField} value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="Zum Beispiel Code-Review" required /></label>
      <label>Prompt<textarea rows={7} value={body} maxLength={16000} onChange={(event) => setBody(event.target.value)} placeholder="Was soll das Modell tun?" required /></label>
      <small className="prompt-char-count">{body.length.toLocaleString("de-DE")} / 16.000 Zeichen</small>
      <div className="studio-result-actions">
        <button className="studio-button primary" type="submit" disabled={!name.trim() || !body.trim()}>{edit ? "Änderung speichern" : "Vorlage speichern"}</button>
        {edit ? <button className="studio-button" type="button" onClick={() => { setEdit(undefined); setName(""); setBody(""); }}>Abbrechen</button> : null}
      </div>
      {notice ? <p className="studio-note" role="status">{notice}</p> : null}
    </form>
  </div>;
}

function TransferPanel({ close }: { close: () => void }) {
  const [pending, setPending] = useState<{ name: string; chats: object[] }>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileRevision = useRef(0);

  async function read(file?: File) {
    const revision = ++fileRevision.current;
    setPending(undefined);
    setNotice("");
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error("Die Datei ist größer als 100 MB.");
      const chats = readNexusExport(await file.text(), file.name);
      if (fileRevision.current === revision) setPending({ name: file.name, chats });
    } catch (error) {
      if (fileRevision.current === revision) setNotice(error instanceof Error ? error.message : "Datei konnte nicht gelesen werden.");
    }
  }

  async function add() {
    if (!pending || busy) return;
    setBusy(true);
    setNotice("");
    try {
      await mergeChats(pending.chats);
      close();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Import fehlgeschlagen.");
      setBusy(false);
    }
  }

  return <div className="studio-transfer">
    <article>
      <ArrowUpFromLine size={21} /><h3>Chats hinzufügen</h3>
      <p>Wähle ein Nexus-Backup (.json) oder einen Nexus-Einzelexport (.md). Der Import fügt Kopien zu deinem Verlauf hinzu.</p>
      <input ref={fileInput} type="file" hidden accept=".json,.md" onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ""; }} />
      <button type="button" className="studio-button" disabled={busy} onClick={() => fileInput.current?.click()}>Datei auswählen</button>
      {pending ? <div className="studio-import-preview">
        <p><strong>{pending.name}</strong><br />{pending.chats.length} {pending.chats.length === 1 ? "Chat" : "Chats"}</p>
        <button className="studio-button primary" type="button" disabled={busy} onClick={add}>{busy ? "Importiere …" : "Zum Verlauf hinzufügen"}</button>
      </div> : null}
      {notice ? <p className="studio-note error" role="status">{notice}</p> : null}
    </article>
    <article>
      <ArrowDownToLine size={21} /><h3>Chats herunterladen</h3>
      <p>Exportiere alle Gespräche und verfügbaren Anhänge als Nexus-JSON. Deine Einstellungen und dein API-Key sind nicht Teil dieses Chat-Exports.</p>
      <button className="studio-button" type="button" onClick={downloadChats}>Chat-Sammlung exportieren</button>
    </article>
  </div>;
}

const quickActions = [
  { label: "Neuer Chat", icon: Plus, action: "new" },
  { label: "Chats und Nachrichten suchen", icon: Search, action: "search" },
  { label: "Modelle durchsuchen", icon: Cpu, action: "models" },
  { label: "Modellvergleich", icon: GitCompareArrows, page: "compare" },
  { label: "Prompt-Bibliothek", icon: BookOpen, page: "prompts" },
  { label: "Chat-Transfer", icon: FileJson, page: "transfer" },
  { label: "OpenRouter API-Explorer", icon: Globe2, action: "api" },
  { label: "Einstellungen", icon: Settings2, action: "settings" },
] satisfies ({ label: string; icon: typeof Plus } & ({ page: StudioPage; action?: never } | { action: StudioAction; page?: never }))[];

function CommandPanel({ navigate, close }: { navigate: (page: StudioPage) => void; close: () => void }) {
  const items = [
    ...quickActions.map((item, index) => ({ id: `action-${index}`, label: item.label, hint: "Werkzeug", group: "Aktionen", keywords: item.action === "new" ? "start beginnen" : item.action === "settings" ? "parameter theme" : "", shortcut: item.action === "search" ? ["Ctrl", "F"] : undefined })),
    ...commandChats().map((chat) => ({ id: `chat-${chat.id}`, label: chat.title, hint: chat.archived ? "Archivierter Chat" : "Unterhaltung öffnen", group: "Chats" })),
  ];
  return <CommandPalette items={items} onSelect={(item) => {
    if (item.id.startsWith("chat-")) {
      if (openStudioChat(item.id.slice(5))) close();
      return;
    }
    const action = quickActions[Number(item.id.slice(7))];
    if (!action) return;
    if (action.page) navigate(action.page);
    else { close(); studioAction(action.action); }
  }} />;
}

export function StudioDialog({ page, navigate, dismiss }: { page: StudioPage | null; navigate: (page: StudioPage) => void; dismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = page !== null;
  useEffect(() => {
    const element = dialog.current;
    if (open && element) {
      if (!element.open) element.showModal();
      const frame = requestAnimationFrame(() => element.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    if (!open && element?.open) element.close();
  }, [open, page]);

  function close() {
    dialog.current?.close();
    dismiss();
  }

  function backdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) close();
  }

  const info = page && pages[page];
  return <dialog ref={dialog} className={`studio-dialog studio-dialog-${page ?? "closed"}`} aria-labelledby="studio-dialog-title" onClose={dismiss} onClick={backdrop}>
    {page && info ? <div className="studio-dialog-inner">
      <header className="studio-dialog-header">
        <span className="studio-dialog-icon"><info.icon size={21} /></span>
        <div><h2 id="studio-dialog-title">{info.title}</h2><p>{info.description}</p></div>
        <button type="button" className="studio-icon-button" aria-label="Schließen" onClick={close}><X size={21} /></button>
      </header>
      <div className="studio-dialog-body" key={page}>
        {page === "command" ? <CommandPanel navigate={navigate} close={close} /> : null}
        {page === "compare" ? <ComparePanel onSaved={close} /> : null}
        {page === "prompts" ? <PromptPanel close={close} /> : null}
        {page === "transfer" ? <TransferPanel close={close} /> : null}
        {page === "connect" ? <ConnectPanel close={close} /> : null}
      </div>
    </div> : null}
  </dialog>;
}
