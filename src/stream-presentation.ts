// Separates bursty network delivery from frame-paced presentation.
export function createStreamPresenter(render: (answer: string, reasoning: string) => void, options: {
  raf?: (cb: FrameRequestCallback) => number; cancel?: (id: number) => void; reducedMotion?: boolean;
} = {}) {
  const raf = options.raf ?? requestAnimationFrame;
  const cancel = options.cancel ?? cancelAnimationFrame;
  let target = { answer: '', reasoning: '' }, shown = { answer: '', reasoning: '' };
  let frame = 0, previous = 0, endAt: number | null = null, resolve: (() => void) | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  function schedule() { if (!frame) frame = raf(tick); }
  function tick(now: number) {
    frame = 0;
    const dt = Math.min(40, previous ? now - previous : 16); previous = now;
    if (endAt === -1) endAt = now + 120;
    for (const key of ['answer', 'reasoning'] as const) {
      if (!target[key].startsWith(shown[key])) shown[key] = '';
      const remaining = target[key].length - shown[key].length;
      let length = options.reducedMotion || (endAt != null && now >= endAt) ? target[key].length :
        shown[key].length + Math.min(remaining, Math.max(1, Math.ceil(remaining * (1 - Math.exp(-dt / 45)))));
      // Do not expose half a UTF-16 surrogate pair.
      if (length < target[key].length && /[\uD800-\uDBFF]/.test(target[key][length - 1] || '')) length++;
      shown[key] = target[key].slice(0, length);
    }
    render(shown.answer, shown.reasoning);
    if (shown.answer !== target.answer || shown.reasoning !== target.reasoning) schedule();
    else { previous = 0; clearTimeout(deadline); const done = resolve; resolve = undefined; done?.(); }
  }
  return {
    push(next: Partial<typeof target>) { target = { ...target, ...next }; schedule(); },
    finish(next: typeof target) {
      target = next; endAt = -1;
      return new Promise<void>((done) => {
        resolve = done; schedule();
        // Background tabs may suspend animation frames. Never leave completion pending.
        deadline = setTimeout(() => {
          if (frame) cancel(frame); frame = 0; shown = { ...target };
          render(shown.answer, shown.reasoning);
          resolve = undefined; done();
        }, 160);
      });
    },
    dispose() { clearTimeout(deadline); if (frame) cancel(frame); frame = 0; resolve?.(); resolve = undefined; }
  };
}

// Preserve stable paragraph/text nodes while Markdown's unfinished tail evolves.
// The caller supplies sanitized HTML only.
export function patchMarkdown(target: HTMLElement, safeHTML: string) {
  const template = document.createElement('template'); template.innerHTML = safeHTML;
  function reconcile(parent: Node, next: Node) {
    let index = 0;
    for (const incoming of [...next.childNodes]) {
      const current = parent.childNodes[index];
      if (!current) parent.appendChild(incoming.cloneNode(true));
      else if (current.nodeType !== incoming.nodeType || current.nodeName !== incoming.nodeName) parent.replaceChild(incoming.cloneNode(true), current);
      else if (current.nodeType === Node.TEXT_NODE) { if (current.nodeValue !== incoming.nodeValue) current.nodeValue = incoming.nodeValue; }
      else if (current instanceof Element && incoming instanceof Element) {
        for (const attr of [...current.attributes]) if (!incoming.hasAttribute(attr.name)) current.removeAttribute(attr.name);
        for (const attr of [...incoming.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
        reconcile(current, incoming);
      }
      index++;
    }
    while (parent.childNodes.length > index) parent.lastChild?.remove();
  }
  reconcile(target, template.content);
}

// Finalize around the live answer/activity without disconnecting either subtree.
// In particular, Safari resets a scrollable thinking list if it is reparented.
export function promoteMessageShell(parent: HTMLElement, shell: HTMLElement, replacements: Map<Element, Element>) {
  const desired = [...shell.children].map(node => replacements.get(node) ?? node);
  const keep = new Set<Node>(desired);
  for (const child of [...parent.childNodes]) if (!keep.has(child)) parent.removeChild(child);
  let cursor: ChildNode | null = parent.firstChild;
  for (const child of desired) {
    if (child === cursor) cursor = cursor.nextSibling;
    else parent.insertBefore(child, cursor);
  }
}

// Follow user intent, rather than treating a small manual scroll as still pinned.
export function createScrollFollower(container: HTMLElement, enabled: boolean) {
  let following = enabled && container.scrollHeight - container.clientHeight - container.scrollTop < 180;
  let lastTop = container.scrollTop;
  const wheel = (event: WheelEvent) => { if (event.deltaY < 0) following = false; };
  const key = (event: KeyboardEvent) => {
    if (['PageUp','Home','ArrowUp'].includes(event.key)) following = false;
    if (event.key === 'End') following = enabled;
  };
  const scroll = () => {
    const top = container.scrollTop;
    if (top < lastTop - 1) following = false;
    else if (top > lastTop && container.scrollHeight - container.clientHeight - top < 4) following = enabled;
    lastTop = top;
  };
  container.addEventListener('wheel', wheel, { passive: true });
  container.addEventListener('keydown', key, true);
  container.addEventListener('scroll', scroll, { passive: true });
  return {
    get following() { return following; },
    pin() { if (following) { scrollImmediately(container, container.scrollHeight); lastTop = container.scrollTop; } },
    dispose() { container.removeEventListener('wheel', wheel); container.removeEventListener('keydown', key, true); container.removeEventListener('scroll', scroll); }
  };
}

// scrollTop assignments inherit CSS scroll-behavior and can start an animation.
// Streaming and restoration must be immediate, even if the page uses smooth scrolling.
export function scrollImmediately(element: HTMLElement, top: number) {
  element.scrollTo({ top, behavior: 'instant' });
}

// React sources/diff views can commit after the network has finished. Keep the
// existing viewport through those layout passes, until the user takes control.
export function preserveCompletedScroll(container: HTMLElement, following: boolean, options: {
  raf?: (callback: FrameRequestCallback) => number; cancel?: (id: number) => void;
} = {}) {
  const raf = options.raf ?? requestAnimationFrame;
  const cancel = options.cancel ?? cancelAnimationFrame;
  const top = container.scrollTop;
  const intentTarget = container.closest?.(".main-area") ?? container;
  let frame = 0, disposed = false;
  const restore = () => { if (!disposed && container.isConnected) scrollImmediately(container, following ? container.scrollHeight : top); };
  const dispose = () => {
    disposed = true; if (frame) cancel(frame); observer?.disconnect();
    for (const name of ['wheel','touchstart','pointerdown','keydown','focusin']) intentTarget.removeEventListener(name, dispose, true);
  };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
    if (!frame && !disposed) frame = raf(() => { frame = 0; restore(); });
  });
  const content = container.firstElementChild;
  if (content) observer?.observe(content);
  for (const name of ['wheel','touchstart','pointerdown','keydown','focusin']) intentTarget.addEventListener(name, dispose, { capture: true, passive: true });
  // Remain attached for late fonts/media as well; user intent or the next
  // conversation render disposes the guard, rather than an arbitrary timeout.
  // One immediate restoration plus the two commits after final React updates.
  restore();
  frame = raf(() => { frame = 0; restore(); if (!disposed) frame = raf(() => { frame = 0; restore(); }); });
  return dispose;
}
