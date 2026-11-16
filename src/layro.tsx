import type { ComponentProps, CSSProperties } from "react";

// Adapted from Layro / @ibelick/prompt-suggestion (MIT).
// Native button and Nexus CSS replace the registry's shadcn Button and utilities.
export function PromptSuggestion({ children, className, highlight, ...props }: ComponentProps<"button"> & { highlight?: string }) {
  const term = highlight?.trim() ?? "";
  const content = typeof children === "string" ? children : "";
  const index = term && content ? content.toLocaleLowerCase("de").indexOf(term.toLocaleLowerCase("de")) : -1;
  return (
    <button type="button" className={["layro-suggestion", className].filter(Boolean).join(" ")} {...props}>
      {index < 0 ? children : <>
        {content.slice(0, index)}
        <mark>{content.slice(index, index + term.length)}</mark>
        {content.slice(index + term.length)}
      </>}
    </button>
  );
}

// Adapted from Layro / @turbostarter/bobbing-dots (MIT).
// Preserve the staggered dot motion with CSS so reduced-motion works without JavaScript.
export function BobbingDots({ dots = 3, label = "Antwort wird geladen" }: { dots?: number; label?: string }) {
  return (
    <span role="status" className="layro-dots" aria-label={label}>
      {Array.from({ length: dots }, (_, index) => (
        <span key={index} aria-hidden="true" style={{ "--dot-delay": `${index * 0.2}s` } as CSSProperties} />
      ))}
    </span>
  );
}
