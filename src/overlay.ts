/** Shared native modal lifecycle for React dialogs, panels and engine tools. */
export function openNativeDialog(dialog: HTMLDialogElement, onDismiss: () => void, initialFocus?: string) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let active = true;
  let outside = false;
  const dismiss = () => { if (active) onDismiss(); };
  const cancel = (event: Event) => { event.preventDefault(); dismiss(); };
  const isOutside = (event: MouseEvent) => {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  const down = (event: MouseEvent) => { outside = event.target === dialog && isOutside(event); };
  const click = (event: MouseEvent) => { if (outside && event.target === dialog && isOutside(event)) dismiss(); outside = false; };
  dialog.addEventListener('cancel', cancel);
  dialog.addEventListener('close', dismiss);
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
    dialog.removeEventListener('close', dismiss);
    dialog.removeEventListener('mousedown', down);
    dialog.removeEventListener('click', click);
    if (dialog.open) dialog.close();
    if (previous?.isConnected && !previous.closest('[inert], dialog:not([open])')) previous.focus({ preventScroll: true });
  } };
}
