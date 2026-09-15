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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't build your path — please try again.");
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="print:hidden space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Disha — What should I learn next?
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          A free, personal learning path built for self-directed learners in Bhopal — no jargon,
          works on a phone, and shows you exactly what to do next.
        </p>
        <button
          type="button"
          onClick={handleTrySample}
          disabled={loading}
          className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Try a sample
        </button>
      </header>

      <section className="print:hidden flex flex-col gap-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="label" htmlFor="currentSkills">
              What can you already do? (in your own words)
            </label>
            <textarea
              id="currentSkills"
              value={intake.currentSkills}
              onChange={(e) => set("currentSkills", e.target.value)}
              className="input mt-1.5 min-h-24"
              placeholder="e.g. I can use WhatsApp and browse YouTube, I typed a few things in Word once"
            />
          </div>

          <div>
            <label className="label" htmlFor="goal">
              What's your goal?
            </label>
            <input
              id="goal"
              value={intake.goal}
              onChange={(e) => set("goal", e.target.value)}
              className="input mt-1.5"
              placeholder="e.g. get freelance web work"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {GOAL_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => set("goal", example)}
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="device">
                What can you study on?
              </label>
              <select
                id="device"
                value={intake.device}
                onChange={(e) => set("device", e.target.value as LearnerDevice)}
                className="input mt-1.5"
              >
                {DEVICES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="hoursPerWeek">
                Hours per week you can realistically give: <span className="font-semibold">{intake.hoursPerWeek}</span>
              </label>
              <input
                id="hoursPerWeek"
                type="range"
                min={1}
                max={40}
                value={intake.hoursPerWeek}
                onChange={(e) => set("hoursPerWeek", Number(e.target.value))}
                className="mt-3 w-full accent-neutral-900 dark:accent-neutral-100"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={intake.absoluteBeginner}
              onChange={(e) => set("absoluteBeginner", e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
            />
            I&apos;m new to computers — files, accounts, basics
          </label>

          <details className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            <summary className="cursor-pointer font-medium text-neutral-800 dark:text-neutral-100">
              New to this? What will I get?
            </summary>
            <p className="mt-2">
              You&apos;ll get an ordered list of <strong>steps</strong>. Each step points to one free{" "}
              <strong>resource</strong> (a video, article or course someone else made — you don&apos;t pay
              for it), and one small <strong>project</strong> — a tiny task you actually build, so you (and
              anyone else) can see you really learned the skill, not just watched something.
            </p>
          </details>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary self-start">
            {loading ? "Building your path…" : "Show my path"}
          </button>
        </form>
      </section>

      {plan && (
        <div id="disha-print-area" className="flex flex-col gap-8">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6 print:border-0 print:p-0 print:shadow-none">
            <p className="text-base font-medium text-neutral-900 dark:text-neutral-50">{plan.summary}</p>
          </section>

          <section className="flex flex-col gap-5">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Your path</h2>
            <ol className="flex flex-col gap-4">
              {[...plan.steps]
                .sort((a, b) => a.order - b.order)
                .map((step) => (
                  <li
                    key={step.order}
                    className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 print:break-inside-avoid print:border print:shadow-none"
                  >
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
                      {step.order}
                    </div>
                    <div className="flex flex-1 flex-col gap-3">
                      <div>
                        <h3 className="font-medium text-neutral-900 dark:text-neutral-50">{step.title}</h3>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{step.why}</p>
                      </div>

                      <span className="w-fit rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        Resource: {step.resourceId}
                      </span>

                      <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
                        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                          Mini-project: {step.project.title}
                        </p>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{step.project.brief}</p>
                        <ul className="mt-2 flex flex-col gap-1">
                          {step.project.acceptanceCriteria.map((criterion, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                              <span aria-hidden className="mt-0.5">
                                ☐
                              </span>
                              <span>{criterion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <label className="print:hidden flex w-fit items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={doneOrders.has(step.order)}
                          onChange={() => toggleDone(step.order)}
                          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                        />
                        Mark done
                      </label>
                    </div>
                  </li>
                ))}
            </ol>

            <div className="print:hidden flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleReplan}
                disabled={replanning || doneOrders.size === 0}
                className="btn-secondary"
              >
                {replanning ? "Re-planning…" : "Re-plan from here"}
              </button>
              <button type="button" onClick={() => window.print()} className="btn-primary">
                Print / Save one-pager
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Where this can lead</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {plan.workMapping.roles.map((role: WorkRole) => (
                <div
                  key={role.category}
                  className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 print:break-inside-avoid print:shadow-none"
                >
                  <h3 className="font-medium text-neutral-900 dark:text-neutral-50">{role.category}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {role.requiredSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {role.locations.map((loc) => (
                      <span
                        key={loc}
                        className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
                      >
                        {loc}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{role.note}</p>
                </div>
              ))}
            </div>

            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {plan.disclaimer}
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
