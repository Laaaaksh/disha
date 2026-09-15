/**
 * Keyless / offline demo-mode fallback for Disha (see app/api/disha/route.ts).
 *
 * Stage safety: a hackathon demo cannot depend on a live network call or a
 * key being present at the exact moment someone is presenting. When
 * ANTHROPIC_API_KEY is missing or DISHA_DEMO_MODE=1, the API route serves one
 * of these pre-generated fixtures instead of calling Claude. The fixtures
 * are NOT hand-written — they were produced by actually running
 * generateDishaPlan() against real intakes (scripts/gen-demo-fixtures.ts),
 * so every resourceId/work category is exactly as grounded as a live call.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DishaIntake, DishaPlan } from "../types";
import { attachResources } from "./enrich";

interface DemoFixture {
  id: string;
  label: string;
  intake: DishaIntake;
  plan: DishaPlan;
}

let cached: DemoFixture[] | null = null;

function loadFixtures(): DemoFixture[] {
  if (cached) return cached;
  const file = path.join(process.cwd(), "data", "demo-plans.json");
  cached = JSON.parse(readFileSync(file, "utf-8")) as DemoFixture[];
  return cached;
}

/**
 * Picks the fixture whose intake.goal best matches the request's goal
 * (case-insensitive substring match, either direction), falling back to the
 * first fixture so demo mode always returns a plan rather than erroring.
 */
export function getDemoPlan(requestedIntake: DishaIntake | undefined): DishaPlan {
  const fixtures = loadFixtures();
  const requestedGoal = requestedIntake?.goal?.trim().toLowerCase() ?? "";

  const match = requestedGoal
    ? fixtures.find((f) => {
        const fixtureGoal = f.intake.goal.trim().toLowerCase();
        return fixtureGoal.includes(requestedGoal) || requestedGoal.includes(fixtureGoal);
      })
    : undefined;

  // Applied at serve-time (not baked into data/demo-plans.json) so the
  // fixtures don't need regenerating whenever CatalogueResource fields
  // change — every demo response still carries step.resource.
  return attachResources((match ?? fixtures[0]).plan);
}
