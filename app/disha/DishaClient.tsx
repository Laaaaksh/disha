"use client";

import { useState } from "react";
import type { DishaIntake, DishaPlan, LearnerDevice, WorkRole } from "@/lib/types";

const DEVICES: Array<{ value: LearnerDevice; label: string }> = [
  { value: "phone-only", label: "Phone only" },
  { value: "phone-and-laptop", label: "Phone + laptop" },
  { value: "shared-computer", label: "Shared computer (cyber café / library)" },
];

const GOAL_EXAMPLES = [
  "Freelance web work",
  "Junior data job",
  "Content writing gigs",
  "Graphic design work",
];

const DEFAULT_INTAKE: DishaIntake = {
  currentSkills: "",
  goal: "",
  device: "phone-only",
  hoursPerWeek: 5,
  absoluteBeginner: false,
};

/** Matches the "web-dev" preset in scripts/gen-demo-fixtures.ts / data/demo-plans.json — kept in sync by hand since it's a tiny, stable demo fixture. */
const SAMPLE_INTAKE: DishaIntake = {
  currentSkills: "I can use WhatsApp and YouTube, and type slowly",
  goal: "Get freelance website work",
  device: "phone-and-laptop",
  hoursPerWeek: 10,
  absoluteBeginner: true,
};

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Builds a Google search for real openings matching a work role — never a promise of a job, just a starting point. */
function workRoleSearchUrl(role: WorkRole): string {
  const query = `${role.category} jobs ${role.locations.join(" ")} India`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/** Small inline "spark" mark for the Claude badge — an evocative starburst, not a
 *  reproduction of Anthropic's trademark. Uses currentColor so it inherits the
 *  Claude accent wherever the badge is placed. */
function ClaudeSpark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
    </svg>
  );
}

/** "Powered by Claude" badge — tasteful, scoped to the Disha page only. */
function ClaudeBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`disha-claude-badge ${className}`}>
      <ClaudeSpark />
      Powered by Claude
    </span>
  );
}

/** Format-specific icon for a resource card — video/article/course/interactive, hand-drawn to avoid a new icon-library dependency. */
function FormatIcon({ format }: { format: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (format) {
    case "video":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8.5l6 3.5-6 3.5v-7z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "article":
      return (
        <svg {...common}>
          <path d="M6 3h9l3 3v15H6V3z" />
          <path d="M9 9.5h6M9 13h6M9 16.5h3.5" />
        </svg>
      );
    case "course":
      return (
        <svg {...common}>
          <path d="M2 8l10-4.5L22 8l-10 4.5L2 8z" />
          <path d="M6 10.3V16c0 1.1 2.7 2.7 6 2.7s6-1.6 6-2.7v-5.7" />
        </svg>
      );
    default:
      // interactive
      return (
        <svg {...common}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

export default function DishaClient() {
  const [intake, setIntake] = useState<DishaIntake>(DEFAULT_INTAKE);
  const [plan, setPlan] = useState<DishaPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneOrders, setDoneOrders] = useState<Set<number>>(new Set());

  function set<K extends keyof DishaIntake>(key: K, value: DishaIntake[K]) {
    setIntake((prev) => ({ ...prev, [key]: value }));
  }

  async function fetchPlan(nextIntake: DishaIntake, completedStepOrders?: number[]) {
    const res = await fetch("/api/disha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        completedStepOrders ? { intake: nextIntake, completedStepOrders } : { intake: nextIntake }
      ),
    });

    // Guard: in dev, a missing ANTHROPIC_API_KEY or a compile error makes the
    // server return an HTML error page instead of JSON. Calling res.json() on
    // that throws a raw "Unexpected token '<', "<!doctype "... is not valid
    // JSON" error straight into the UI — so check content-type before ever
    // parsing, and never let that raw parse error reach the user.
    const contentType = res.headers.get("content-type") ?? "";
    const looksLikeJson = contentType.includes("application/json");

    if (!looksLikeJson) {
      await res.text().catch(() => undefined); // drain the body defensively; it's never parsed
      throw new Error(
        "Couldn't reach the planner. Make sure the dev server is running and ANTHROPIC_API_KEY is set in .env.local (or use demo mode)."
      );
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const message = data && typeof data.error === "string" ? data.error : undefined;
      throw new Error(
        message ??
          "Couldn't reach the planner. Make sure the dev server is running and ANTHROPIC_API_KEY is set in .env.local (or use demo mode)."
      );
    }

    return data as DishaPlan;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!intake.goal.trim()) {
      setError("Tell us what you're aiming for — even a rough idea is fine.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const nextPlan = await fetchPlan(intake);
      setPlan(nextPlan);
      setDoneOrders(new Set(nextPlan.steps.filter((s) => s.done).map((s) => s.order)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTrySample() {
    setIntake(SAMPLE_INTAKE);
    setError(null);
    setLoading(true);
    try {
      const nextPlan = await fetchPlan(SAMPLE_INTAKE);
      setPlan(nextPlan);
      setDoneOrders(new Set(nextPlan.steps.filter((s) => s.done).map((s) => s.order)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReplan() {
    if (!plan) return;
    setError(null);
    setReplanning(true);
    try {
      const nextPlan = await fetchPlan(plan.intake, Array.from(doneOrders).sort((a, b) => a - b));
      setPlan(nextPlan);
      setDoneOrders(new Set(nextPlan.steps.filter((s) => s.done).map((s) => s.order)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReplanning(false);
    }
  }

  function toggleDone(order: number) {
    setDoneOrders((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
      <header className="print:hidden flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="disha-eyebrow">
            <ClaudeSpark />
            Disha
          </span>
          <ClaudeBadge />
        </div>
        <h1 className="disha-display disha-text text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">
          What should you learn next?
        </h1>
        <p className="disha-text-secondary max-w-xl text-base leading-relaxed sm:text-lg">
          A free, personal learning path built for self-directed learners in Bhopal — no jargon,
          works on a phone, and shows you exactly what to do next.
        </p>
        <button
          type="button"
          onClick={handleTrySample}
          disabled={loading}
          className="disha-chip w-fit disabled:cursor-not-allowed disabled:opacity-50"
        >
          Try a sample
        </button>
      </header>

      <section className="disha-card print:hidden flex flex-col gap-5 p-5 sm:p-7">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="disha-label" htmlFor="currentSkills">
              What can you already do? (in your own words)
            </label>
            <textarea
              id="currentSkills"
              value={intake.currentSkills}
              onChange={(e) => set("currentSkills", e.target.value)}
              className="disha-textarea mt-1.5 min-h-24"
              placeholder="e.g. I can use WhatsApp and browse YouTube, I typed a few things in Word once"
            />
          </div>

          <div>
            <label className="disha-label" htmlFor="goal">
              What's your goal?
            </label>
            <input
              id="goal"
              value={intake.goal}
              onChange={(e) => set("goal", e.target.value)}
              className="disha-input mt-1.5"
              placeholder="e.g. get freelance web work"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {GOAL_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => set("goal", example)}
                  className="disha-chip"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="disha-label" htmlFor="device">
                What can you study on?
              </label>
              <select
                id="device"
                value={intake.device}
                onChange={(e) => set("device", e.target.value as LearnerDevice)}
                className="disha-select mt-1.5"
              >
                {DEVICES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="disha-label" htmlFor="hoursPerWeek">
                Hours per week you can realistically give:{" "}
                <span className="disha-accent-text font-semibold">{intake.hoursPerWeek}</span>
              </label>
              <input
                id="hoursPerWeek"
                type="range"
                min={1}
                max={40}
                value={intake.hoursPerWeek}
                onChange={(e) => set("hoursPerWeek", Number(e.target.value))}
                className="mt-4 w-full accent-[var(--disha-accent)]"
              />
            </div>
          </div>

          <label className="disha-text-secondary flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={intake.absoluteBeginner}
              onChange={(e) => set("absoluteBeginner", e.target.checked)}
              className="disha-checkbox"
            />
            I&apos;m new to computers — files, accounts, basics
          </label>

          <details className="disha-project-box disha-text-secondary text-sm">
            <summary className="disha-text cursor-pointer font-medium">
              New to this? What will I get?
            </summary>
            <p className="mt-2">
              You&apos;ll get an ordered list of <strong>steps</strong>. Each step points to one free{" "}
              <strong>resource</strong> (a video, article or course someone else made — you don&apos;t pay
              for it), and one small <strong>project</strong> — a tiny task you actually build, so you (and
              anyone else) can see you really learned the skill, not just watched something.
            </p>
          </details>

          {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="disha-btn-primary self-start">
            {loading ? "Building your path…" : "Show my path"}
          </button>
        </form>
      </section>

      {plan && (
        <div id="disha-print-area" className="flex flex-col gap-10">
          <section className="disha-card p-5 sm:p-7 print:border print:border-0 print:p-0 print:shadow-none">
            <p className="disha-display disha-text text-lg leading-snug sm:text-xl">{plan.summary}</p>
            <p className="disha-generated-note mt-3 text-xs">
              <ClaudeSpark className="disha-generated-note-spark" /> Learning path generated by Claude
              (Anthropic)
            </p>
          </section>

          <section className="flex flex-col gap-5">
            <h2 className="disha-display disha-text text-xl font-medium sm:text-2xl">Your path</h2>
            <ol className="disha-timeline">
              {[...plan.steps]
                .sort((a, b) => a.order - b.order)
                .map((step, idx, sorted) => {
                  const isDone = doneOrders.has(step.order);
                  const isLast = idx === sorted.length - 1;
                  return (
                    <li key={step.order} className="disha-step print:break-inside-avoid">
                      <div className="disha-step-rail">
                        <span className="disha-step-number">{step.order}</span>
                        {!isLast && <span aria-hidden className="disha-step-line" />}
                      </div>

                      <div className="disha-step-card disha-card p-5 print:shadow-none sm:p-6">
                        <div className="flex flex-1 flex-col gap-3.5">
                          <div>
                            <h3 className="disha-text font-semibold">{step.title}</h3>
                            <p className="disha-text-secondary mt-1 text-sm">{step.why}</p>
                          </div>

                          {step.resource ? (
                            <a
                              href={step.resource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="disha-resource-link group"
                            >
                              <span className="disha-format-badge">
                                <FormatIcon format={step.resource.format} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="disha-text block truncate text-sm font-semibold">
                                  {step.resource.title}
                                </span>
                                <span className="disha-text-secondary block truncate text-xs">
                                  {step.resource.provider}
                                </span>
                                <span className="mt-1.5 flex flex-wrap gap-1.5">
                                  <span className="disha-meta-badge">{capitalize(step.resource.format)}</span>
                                  <span className="disha-meta-badge">{step.resource.durationHours}h</span>
                                  <span className="disha-meta-badge">{capitalize(step.resource.level)}</span>
                                </span>
                              </span>
                              <span
                                aria-hidden
                                className="disha-accent-text flex-none text-lg transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                              >
                                ↗
                              </span>
                            </a>
                          ) : (
                            <span className="disha-meta-badge">Resource: {step.resourceId}</span>
                          )}

                          <div className="disha-project-box">
                            <p className="disha-text text-sm font-semibold">
                              Mini-project: {step.project.title}
                            </p>
                            <p className="disha-text-secondary mt-1 text-sm">{step.project.brief}</p>
                            <ul className="mt-2.5 flex flex-col gap-1.5">
                              {step.project.acceptanceCriteria.map((criterion, i) => (
                                <li key={i} className="disha-checklist-item">
                                  <span aria-hidden className="disha-checklist-mark" />
                                  <span>{criterion}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <label
                            className={`disha-done-toggle print:hidden ${isDone ? "is-done" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() => toggleDone(step.order)}
                              className="sr-only"
                            />
                            {isDone ? "✓ Done" : "Mark done"}
                          </label>
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ol>

            <div className="print:hidden flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleReplan}
                disabled={replanning || doneOrders.size === 0}
                className="disha-btn-secondary"
              >
                {replanning ? "Re-planning…" : "Re-plan from here"}
              </button>
              <button type="button" onClick={() => window.print()} className="disha-btn-primary">
                Print / Save one-pager
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="disha-display disha-text text-xl font-medium sm:text-2xl">
              Where this can lead
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {plan.workMapping.roles.map((role: WorkRole) => (
                <div
                  key={role.category}
                  className="disha-card flex flex-col gap-3 p-4 print:shadow-none sm:p-5"
                >
                  <h3 className="disha-text font-semibold">{role.category}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {role.requiredSkills.map((skill) => (
                      <span key={skill} className="disha-skill-chip">
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {role.locations.map((loc) => (
                      <span key={loc} className="disha-location-badge">
                        {loc}
                      </span>
                    ))}
                  </div>
                  <p className="disha-text-secondary text-sm">{role.note}</p>
                  <a
                    href={workRoleSearchUrl(role)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="disha-search-link print:hidden"
                  >
                    Search openings ↗
                  </a>
                </div>
              ))}
            </div>

            <p className="disha-disclaimer">{plan.disclaimer}</p>
          </section>
        </div>
      )}
    </main>
  );
}
