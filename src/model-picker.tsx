import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ModelOption } from './nexus-engine.js';
export function ModelPicker({ label, value, models, disabled, onChange }: { label: string; value: string; models: ModelOption[]; disabled: boolean; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const matches = models.filter(model => `${model.name} ${model.id}`.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de')));
  const index = Math.max(0, Math.min(active, matches.length - 1));
  useEffect(() => { if (open) input.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => { const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside); }, []);
  function choose(model: ModelOption) { onChange(model.id); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  return <div className="compare-model-field" ref={root} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label id={`${id}-label`}>{label}</label>
    <button ref={trigger} type="button" className="compare-picker" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => { setOpen(!open); setQuery(''); setActive(0); }}><span id={`${id}-value`}>{models.find(model => model.id === value)?.name || 'Modell wählen'}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {open ? <div className="compare-picker-menu"><input ref={input} role="combobox" aria-label={`${label} durchsuchen`} aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={matches[index] ? `${id}-${index}` : undefined} value={query} placeholder="Modell suchen" onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Enter') { event.preventDefault(); if (matches[index]) choose(matches[index]); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % Math.max(1, matches.length); setActive(next); root.current?.querySelector(`#${CSS.escape(id + '-' + next)}`)?.scrollIntoView({ block: 'nearest' }); }
    }} /><ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}>{matches.map((model, at) => <li key={model.id} id={`${id}-${at}`} role="option" aria-selected={at === index} onMouseDown={event => event.preventDefault()} onPointerMove={() => setActive(at)} onClick={() => choose(model)}>{model.name}</li>)}</ul>{!matches.length ? <p className="studio-note">Keine passenden Modelle</p> : null}</div> : null}
  </div>;
}
