/**
 * Attaches the full CatalogueResource to each DishaStep so the UI can render
 * a direct, clickable link (title, provider, real url) instead of a bare
 * resourceId. Applied server-side to both the live path (generate.ts) and
 * the demo path (demoMode.ts) so every response — live or fixture — carries
 * step.resource.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogueResource, DishaPlan } from "../types";

// Loaded once at module scope (not per step/request) — the catalogue is a
// small static file and re-reading/parsing it per step would be wasted work.
let catalogue: CatalogueResource[] | null = null;

function loadCatalogue(): CatalogueResource[] {
  if (catalogue) return catalogue;
  const file = path.join(process.cwd(), "data", "catalogue.json");
  catalogue = JSON.parse(readFileSync(file, "utf-8")) as CatalogueResource[];
  return catalogue;
}

/**
 * Resolves each step's resourceId against the catalogue and sets
 * step.resource to the match. If a resourceId somehow isn't found (stale
 * fixture, edited catalogue), resource is simply left undefined — no link
 * rather than a broken one, per DishaStep's contract in lib/types.ts.
 */
export function attachResources(plan: DishaPlan): DishaPlan {
  const byId = new Map(loadCatalogue().map((r) => [r.id, r]));
  return {
    ...plan,
    steps: plan.steps.map((step) => ({
      ...step,
      resource: byId.get(step.resourceId),
    })),
  };
}
