/**
 * Generates data/demo-plans.json — REAL Claude-generated DishaPlan fixtures
 * used by the API's keyless demo-mode fallback (see app/api/disha/route.ts).
 *
 * These are not hand-fabricated: this script calls the exact same
 * generateDishaPlan() the live API path uses, so every resourceId/work
 * category is grounded against data/catalogue.json/data/jobs.json the normal
 * way. Run it whenever the presets below change or the catalogue/jobs data
 * changes enough that the fixtures should be regenerated:
 *
 *   export ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' .env.local | cut -d= -f2-) \
 *     && npx tsx scripts/gen-demo-fixtures.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { generateDishaPlan } from "../lib/disha/generate";
import type { DishaIntake, DishaPlan } from "../lib/types";

interface DemoFixture {
  id: string;
  label: string;
  intake: DishaIntake;
  plan: DishaPlan;
}

const PRESETS: Array<{ id: string; label: string; intake: DishaIntake }> = [
  {
    id: "web-dev",
    label: "Freelance web work (absolute beginner)",
    intake: {
      currentSkills: "I can use WhatsApp and YouTube, and type slowly",
      goal: "Get freelance website work",
      device: "phone-and-laptop",
      hoursPerWeek: 10,
      absoluteBeginner: true,
    },
  },
  {
    id: "data",
    label: "Junior data analyst (basic Excel/English)",
    intake: {
      currentSkills: "I know basic Excel and some English",
      goal: "Become a junior data analyst",
      device: "phone-and-laptop",
      hoursPerWeek: 8,
      absoluteBeginner: false,
    },
  },
];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set in this shell. Run:\n" +
        "  export ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' .env.local | cut -d= -f2-) && npx tsx scripts/gen-demo-fixtures.ts",
    );
    process.exit(1);
  }

  const fixtures: DemoFixture[] = [];
  for (const preset of PRESETS) {
    console.log(`Generating fixture "${preset.id}"...`);
    const plan = await generateDishaPlan({ intake: preset.intake });
    if (!plan.steps.length || !plan.workMapping.roles.length) {
      throw new Error(`Fixture "${preset.id}" came back with empty steps/workMapping — refusing to write it.`);
    }
    fixtures.push({ id: preset.id, label: preset.label, intake: preset.intake, plan });
    console.log(`  ok: ${plan.steps.length} steps, ${plan.workMapping.roles.length} roles`);
  }

  const outFile = path.join(process.cwd(), "data", "demo-plans.json");
  writeFileSync(outFile, JSON.stringify(fixtures, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${fixtures.length} fixtures to ${outFile}`);
}

main().catch((err) => {
  console.error("Failed to generate demo fixtures:", err);
  process.exit(1);
});
