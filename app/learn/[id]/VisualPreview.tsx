"use client";

import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { VisualSpec } from "./types";

/**
 * A preview of a planned visual for the plan-review screen. KaTeX and Mermaid
 * render faithfully here (both are already dependencies and render client-side
 * from a real DOM), so a diagram shows as an actual diagram, not raw source —
 * the polished, avatar-narrated version still appears in the generated video.
 * Other renderers (shiki/svg/html) fall back to a compact source preview.
 */
export function VisualPreview({ visual }: { visual: VisualSpec }) {
  const isMath = visual.renderer === "katex";
  const isMermaid = visual.renderer === "mermaid";
  const rendersHere = isMath || isMermaid;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-neutral-900 px-2.5 py-1 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          {visual.kind}
        </span>
        <span className="text-neutral-400">via {visual.renderer}</span>
      </div>
      <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
        <span className="font-medium text-neutral-900 dark:text-neutral-50">Why this visual: </span>
        {visual.rationale}
      </p>

      {isMath ? (
        <KatexBlock latex={visual.content} />
      ) : isMermaid ? (
        <MermaidBlock source={visual.content} />
      ) : (
        <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-xs text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
          {visual.content}
        </pre>
      )}
      {visual.caption && <p className="mt-2 text-xs italic text-neutral-500 dark:text-neutral-400">{visual.caption}</p>}
      {!rendersHere && <p className="mt-1 text-[11px] text-neutral-400">Full rendering appears in the teaching video.</p>}
    </div>
  );
}

function KatexBlock({ latex }: { latex: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, { throwOnError: false, displayMode: true });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex]);

  return <div ref={ref} className="mt-3 overflow-x-auto rounded bg-white p-3 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100" />;
}

function MermaidBlock({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Mermaid needs a real DOM, so import it lazily in the effect (never on the server).
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", fontFamily: "system-ui, sans-serif" });
        const id = "mmd-" + Math.random().toString(36).slice(2);
        const { svg } = await mermaid.render(id, source);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        // Malformed diagram source: fall back to showing the source rather than an empty box.
        if (!cancelled && ref.current) {
          ref.current.textContent = source;
          ref.current.classList.add("whitespace-pre-wrap", "text-xs", "text-neutral-500");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  // White ground in both themes: the "neutral" Mermaid theme reads clearest on light.
  return <div ref={ref} className="mt-3 overflow-x-auto rounded bg-white p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" />;
}
