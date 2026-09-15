/**
 * Disha's planner: turns a learner's intake into an ordered, personalised
 * DishaPlan by asking Claude (via lib/teach/llm.ts's `json()`) to sequence
 * steps from the curated FREE-resource catalogue (data/catalogue.json) and
 * map the resulting path to realistic categories of work (data/jobs.json).
 *
 * Grounding is enforced in code, not just by prompt: the model is only ever
 * shown the catalogue's ids and the jobs' category names, and every id it
 * returns is re-checked against those lists after the call (see
 * `sanitizeSteps`/`sanitizeWorkRoles` below) so a hallucinated id can never
 * reach the UI.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { json } from "../teach/llm";
import type { ChatMessage } from "../sarvam";
import type {
  CatalogueResource,
  DishaIntake,
  DishaPlan,
  DishaStep,
  WorkRole,
} from "../types";

/** Fixed, plain-English standing disclaimer — Disha describes work categories, it never promises a job. */
const DISCLAIMER =
  "Disha shows categories of work and the skills they typically need, based on a curated set of free resources — it does not guarantee a job, an interview, or income.";

function loadCatalogue(): CatalogueResource[] {
  const file = path.join(process.cwd(), "data", "catalogue.json");
  return JSON.parse(readFileSync(file, "utf-8")) as CatalogueResource[];
}

function loadJobs(): WorkRole[] {
  const file = path.join(process.cwd(), "data", "jobs.json");
  return JSON.parse(readFileSync(file, "utf-8")) as WorkRole[];
}

const LlmProjectSchema = z.object({
  title: z.string(),
  brief: z.string(),
  acceptanceCriteria: z.array(z.string()).min(2).max(4),
});

const LlmStepSchema = z.object({
  order: z.number().int(),
  title: z.string(),
  why: z.string(),
  resourceId: z.string(),
  project: LlmProjectSchema,
});

const LlmPlanSchema = z.object({
  summary: z.string(),
  steps: z.array(LlmStepSchema).min(1),
  /** Category names chosen from the provided jobs list — never invented roles. */
  workRoleCategories: z.array(z.string()).min(1),
});

export interface GenerateDishaPlanInput {
  intake: DishaIntake;
  /** Step orders (from a previous plan) the learner has already completed, for re-planning the remaining path. */
  completedStepOrders?: number[];
}

function deviceInstruction(device: DishaIntake["device"]): string {
  switch (device) {
    case "phone-only":
      return "The learner studies on a phone only, likely on a slow/limited data connection — strongly prefer 'article'/'interactive' resources over long videos, and avoid resources that assume a laptop-only tool.";
    case "shared-computer":
      return "The learner shares a computer with others, so session time may be short and interrupted — prefer resources that work in short, resumable sessions.";
    case "phone-and-laptop":
    default:
      return "The learner has both a phone and a laptop, so format is flexible.";
  }
}

export async function generateDishaPlan(input: GenerateDishaPlanInput): Promise<DishaPlan> {
  const { intake, completedStepOrders } = input;
  const catalogue = loadCatalogue();
  const jobs = loadJobs();

  const catalogueForPrompt = catalogue.map((r) => ({
    id: r.id,
    title: r.title,
    skill: r.skill,
    level: r.level,
    durationHours: r.durationHours,
    prerequisites: r.prerequisites,
    format: r.format,
  }));
  const jobsForPrompt = jobs.map((j) => ({ category: j.category, requiredSkills: j.requiredSkills, locations: j.locations }));

  const replanNote =
    completedStepOrders && completedStepOrders.length > 0
      ? `The learner has already completed steps numbered: ${completedStepOrders.join(", ")} from a previous version of this plan. Do NOT repeat those; produce the remaining/adjusted path forward from here, renumbering steps starting at 1.`
      : "This is a first-time plan for this learner.";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are Disha, a plain-English 'what should I learn next' guidance planner for a self-directed learner in a Tier-2 Indian city (Bhopal). " +
        "You must build an ORDERED learning path using ONLY resources from the CATALOGUE below (never invent a resource or an id), and map the path to ONLY the work categories from the JOBS list below (never invent a role). " +
        "Order steps foundational-first, respecting each resource's declared prerequisites (a resource's prerequisites are skill tags that must appear as the `skill` of an earlier step's resource). " +
        `${intake.absoluteBeginner ? "The learner is an absolute beginner with computers — start with computer-basics resources and use very plain, jargon-free language throughout." : "The learner already has some basic comfort with computers."} ` +
        `${deviceInstruction(intake.device)} ` +
        `The learner has about ${intake.hoursPerWeek} hours per week to study — choose a number of steps and resource durations that realistically fit that pace (don't overload the path). ` +
        `${replanNote}\n\n` +
        "For each step give: order (integer, starting at 1), title, why (one or two plain-English sentences, no jargon, on why this step now), resourceId (must be an id from CATALOGUE), and project (a small MiniProject: title, brief in plain English, and 2-3 concrete acceptanceCriteria a learner can self-check). " +
        "Also pick workRoleCategories: the category names (verbatim, from JOBS) most relevant to the learner's goal.\n\n" +
        `CATALOGUE (use only these ids):\n${JSON.stringify(catalogueForPrompt)}\n\n` +
        `JOBS (use only these category names):\n${JSON.stringify(jobsForPrompt)}\n\n` +
        'Respond with ONLY a JSON object of exactly this shape: {"summary": string, "steps": [{"order": number, "title": string, "why": string, "resourceId": string, "project": {"title": string, "brief": string, "acceptanceCriteria": [string, ...]}}], "workRoleCategories": [string, ...]}',
    },
    {
      role: "user",
      content:
        `What I can already do: ${intake.currentSkills || "nothing stated"}\n` +
        `My goal: ${intake.goal}\n` +
        `Device: ${intake.device}\n` +
        `Hours per week I can study: ${intake.hoursPerWeek}\n` +
        `I'm an absolute beginner with computers: ${intake.absoluteBeginner ? "yes" : "no"}`,
    },
  ];

  const draft = await json(LlmPlanSchema, { messages, temperature: 0.4 });

  const steps = sanitizeSteps(draft.steps, catalogue);
  const roles = sanitizeWorkRoles(draft.workRoleCategories, jobs, steps, catalogue);

  return {
    intake,
    summary: draft.summary,
    steps,
    workMapping: { goal: intake.goal, roles },
    disclaimer: DISCLAIMER,
  };
}

/**
 * Guard: the model can only choose ids we handed it, but a same-request
 * retry, a slightly-off id, or a future prompt change could still let a
 * hallucinated resourceId through — so drop (rather than crash on) any step
 * whose resourceId isn't actually in the catalogue, and renumber the
 * survivors so `order` stays a clean 1..N sequence for the UI.
 */
function sanitizeSteps(steps: z.infer<typeof LlmStepSchema>[], catalogue: CatalogueResource[]): DishaStep[] {
  const knownIds = new Set(catalogue.map((r) => r.id));
  const valid = steps
    .filter((s) => knownIds.has(s.resourceId))
    .sort((a, b) => a.order - b.order);

  return valid.map((s, i) => ({
    order: i + 1,
    title: s.title,
    why: s.why,
    resourceId: s.resourceId,
    project: {
      title: s.project.title,
      brief: s.project.brief,
      acceptanceCriteria: s.project.acceptanceCriteria,
    },
    done: false,
  }));
}

/**
 * Guard: only ever return WorkRole objects that exist verbatim in
 * data/jobs.json. If the model's category names don't match anything (typo,
 * paraphrase, or all steps were dropped by sanitizeSteps above), fall back
 * to whichever jobs share a required skill with the surviving steps' skills,
 * so the response is never empty.
 */
function sanitizeWorkRoles(
  categories: string[],
  jobs: WorkRole[],
  steps: DishaStep[],
  catalogue: CatalogueResource[],
): WorkRole[] {
  const wanted = new Set(categories.map((c) => c.trim().toLowerCase()));
  const matched = jobs.filter((j) => wanted.has(j.category.trim().toLowerCase()));
  if (matched.length > 0) return matched;

  const resourceById = new Map(catalogue.map((r) => [r.id, r]));
  const pathSkills = new Set(
    steps.map((s) => resourceById.get(s.resourceId)?.skill).filter((s): s is string => Boolean(s)),
  );
  const bySkillOverlap = jobs.filter((j) => j.requiredSkills.some((skill) => pathSkills.has(skill)));
  return bySkillOverlap.length > 0 ? bySkillOverlap : jobs.slice(0, 3);
}
