import { ArrowUpRight, CornerDownLeft, MessageSquare, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { rankCommands, type CommandItem } from "./command-ranking";

// Layro @ddoemonn/command-palette, MIT, 1.0.0.
// Ranked matching, active-descendant navigation and pointer activation adapted
// to Nexus's native modal. CSS handles transitions and reduced motion.
export function CommandPalette({ items, onSelect }: { items: CommandItem[]; onSelect: (item: CommandItem) => void }) {
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<string | null>(null);
  const uid = useId();
  const list = useRef<HTMLUListElement>(null);
  const pointer = useRef({ x: -1, y: -1 });
  const results = useMemo(() => rankCommands(items, query), [items, query]);
  const activeId = results.some(({ id }) => id === pinned) ? pinned : results[0]?.id;
  const activeIndex = results.findIndex(({ id }) => id === activeId);
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [query]);

  function jump(index: number) {
    if (!results.length) return;
    const next = (index + results.length) % results.length;
    setPinned(results[next].id);
    const row = list.current?.querySelector<HTMLElement>(`[data-index="${next}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }

  return <div className="nexus-command">
    <label className="nexus-command-search">
      <Search size={20} aria-hidden="true" />
      <input autoFocus role="combobox" aria-label="Schnellaktionen und Chats suchen" aria-expanded="true" aria-controls={`${uid}-list`} aria-activedescendant={activeId ? `${uid}-${activeId}` : undefined} aria-autocomplete="list" autoComplete="off" spellCheck={false} value={query} placeholder="Aktionen oder Chats suchen …" onChange={(event) => { setQuery(event.target.value); setPinned(null); }} onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "ArrowDown") { event.preventDefault(); jump(activeIndex + 1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); jump(activeIndex - 1); }
        else if (event.key === "Enter") { event.preventDefault(); if (activeIndex >= 0) onSelect(results[activeIndex]); }
        else if (event.key === "Home" && event.ctrlKey) { event.preventDefault(); jump(0); }
        else if (event.key === "End" && event.ctrlKey) { event.preventDefault(); jump(results.length - 1); }
      }} />
      <kbd>Esc</kbd>
    </label>
    <ul ref={list} id={`${uid}-list`} role="listbox" aria-label="Suchergebnisse" className="nexus-command-list">
      {results.map((item, index) => <li key={item.id} id={`${uid}-${item.id}`} role="option" aria-selected={item.id === activeId} data-index={index} onMouseDown={(event) => event.preventDefault()} onPointerMove={(event) => {
        if (pointer.current.x === event.clientX && pointer.current.y === event.clientY) return;
        pointer.current = { x: event.clientX, y: event.clientY };
        setPinned(item.id);
      }} onClick={() => onSelect(item)}>
        {item.group === "Chats" ? <MessageSquare size={17} aria-hidden="true" /> : <ArrowUpRight size={17} aria-hidden="true" />}
        <span>{item.label}<small>{item.hint ?? item.group}</small></span>
        {item.shortcut ? <span className="command-keys">{item.shortcut.map((key) => <kbd key={key}>{key}</kbd>)}</span> : null}
        <CornerDownLeft className="command-return" size={15} aria-hidden="true" />
      </li>)}
    </ul>
    {!results.length ? <div className="nexus-command-empty"><Search size={24} aria-hidden="true" /><p>Keine passende Aktion oder Unterhaltung</p><small>Versuche einen kürzeren Suchbegriff.</small></div> : null}
    <footer><span><kbd>↑</kbd><kbd>↓</kbd> Auswählen</span><span><kbd>Enter</kbd> Öffnen</span><span role="status" aria-live="polite">{results.length} Treffer</span></footer>
  </div>;
}
