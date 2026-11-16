/** Shared native modal lifecycle for React dialogs, panels and engine tools. */
export function openNativeDialog(dialog: HTMLDialogElement, onDismiss: () => void, initialFocus?: string) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let active = true;
  let outside = false;
  const dismiss = () => { if (active) onDismiss(); };
  const closed = () => { if (!dialog.open) dismiss(); };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const nodes = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], summary, [tabindex="0"]')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden" && !node.closest("[inert]"));
    const first = nodes[0], last = nodes.at(-1);
    if (!first) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };
  const cancel = (event: Event) => { event.preventDefault(); dismiss(); };
  const isOutside = (event: MouseEvent) => {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  const down = (event: MouseEvent) => { outside = event.target === dialog && isOutside(event); };
  const click = (event: MouseEvent) => { if (outside && event.target === dialog && isOutside(event)) dismiss(); outside = false; };
  dialog.addEventListener('cancel', cancel);
  dialog.addEventListener('close', closed);
  dialog.addEventListener('keydown', keyboard);
  dialog.addEventListener('mousedown', down);
  dialog.addEventListener('click', click);
  if (!dialog.open) dialog.showModal();
  const frame = requestAnimationFrame(() => {
    if (!active || !dialog.open) return;
    const target = dialog.querySelector<HTMLElement>(initialFocus || '[autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])');
    (target || dialog).focus({ preventScroll: true });
  });
  return { dispose() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frame);
    dialog.removeEventListener('cancel', cancel);
    dialog.removeEventListener('close', closed);
    dialog.removeEventListener('keydown', keyboard);
    dialog.removeEventListener('mousedown', down);
    dialog.removeEventListener('click', click);
    if (dialog.open) dialog.close();
    const target = previous?.closest("details:not([open])")?.querySelector<HTMLElement>("summary") || previous;
    if (target?.isConnected && target.getClientRects().length && !target.closest('[inert], dialog:not([open])')) target.focus({ preventScroll: true });
    else document.querySelector<HTMLElement>("#btn-toggle-sb")?.focus({ preventScroll: true });
  } };
}
