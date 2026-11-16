import { AIContextMeter } from "./layro-context";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { parseDiff, type DiffDecision } from "./diff";
import { AIInputSearch, type ComposerProps } from "./layro-composer";
import { AIDiffReview, AILoading, SourceLinks, type Activity } from "./layro-response";
import type { Citation } from "./openrouter-sources";

export function mountComposer(target: HTMLElement, props: ComposerProps) {
  const root = createRoot(target);
  flushSync(() => root.render(<AIInputSearch {...props} />));
  return () => root.unmount();
}

export function mountActivity(target: HTMLElement, initial: Activity) {
  const root = createRoot(target);
  const update = (activity: Activity) => root.render(<AILoading {...activity} />);
  update(initial);
  return { update, settle: (activity: Activity) => flushSync(() => root.render(<AILoading {...activity} />)), dispose: () => queueMicrotask(() => root.unmount()) };
}

type ReviewMap = Record<number, Record<number, DiffDecision>>;

export function mountDiffs(target: HTMLElement, reviews: ReviewMap = {}, onDecision?: (block: number, file: number, decision: DiffDecision) => void) {
  const roots = [...target.querySelectorAll("pre > code")].flatMap((code, block) => {
    const patch = code.textContent ?? "";
    if (!code.matches(".language-diff, .language-patch, .language-v4a") && !patch.startsWith("diff --git ") && !patch.startsWith("*** Begin Patch\n")) return [];
    const files = parseDiff(patch);
    if (!files) return [];
    const host = document.createElement("div");
    code.parentElement?.replaceWith(host);
    const root = createRoot(host);
    const initial = Object.fromEntries(Object.entries(reviews[block] ?? {}).filter(([, value]) => value === "accepted" || value === "rejected"));
    root.render(<AIDiffReview patch={patch} files={files} initial={initial} onDecision={(file, decision) => onDecision?.(block, file, decision)} />);
    return [root];
  });
  return () => queueMicrotask(() => roots.forEach((root) => root.unmount()));
}

export function mountSources(target: HTMLElement, sources: Citation[]) {
  const root = createRoot(target);
  root.render(<SourceLinks sources={sources} />);
  return () => queueMicrotask(() => root.unmount());
}

export function mountContext(target: HTMLElement) {
  const root = createRoot(target);
  return { update: (snapshot: import("./context").ContextSnapshot) => root.render(<AIContextMeter snapshot={snapshot} />), dispose: () => queueMicrotask(() => root.unmount()) };
}
