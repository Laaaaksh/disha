/**
 * Records a polished ~40-60s MP4 demo of the /disha flow using Playwright's
 * native video recording, at a phone-width viewport to showcase the
 * mobile-first design.
 *
 * COST SAFETY: this drives whatever server is already running at BASE_URL.
 * It does not start the server itself and never sets/needs
 * ANTHROPIC_API_KEY — run the target server with DISHA_DEMO_MODE=1 (see
 * app/api/disha/route.ts / lib/disha/demoMode.ts) so it serves a
 * pre-generated fixture instead of calling Claude. This script makes zero
 * Anthropic API calls itself either way; the cost guarantee lives in how the
 * server under test is started, not here.
 *
 * Usage: npx tsx scripts/record-demo/record-disha.ts
 * Env: BASE_URL (default http://localhost:3000)
 */
import { chromium } from "playwright";
import { mkdtempSync, renameSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(__dirname, "output");
const RAW_VIDEO_DIR = mkdtempSync(path.join(tmpdir(), "disha-demo-"));
const FINAL_WEBM = path.join(OUT_DIR, "disha-demo-raw.webm");

const VIEWPORT = { width: 430, height: 900 };

const CURRENT_SKILLS = "I can use WhatsApp and YouTube, and type a little";
const GOAL = "Get freelance website work"; // matches the "web-dev" demo fixture exactly (data/demo-plans.json)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: RAW_VIDEO_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  try {
    // ---- 1. Land on /disha, let the header/tagline breathe ----
    console.log("Navigating to /disha ...");
    await page.goto(`${BASE_URL}/disha`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Disha/ }).waitFor({ state: "visible" });
    await sleep(2200);

    // ---- 2. Fill the intake form visibly, at a human pace ----
    const skillsField = page.locator("#currentSkills");
    await skillsField.scrollIntoViewIfNeeded();
    await skillsField.click();
    await skillsField.pressSequentially(CURRENT_SKILLS, { delay: 40 });
    await sleep(800);

    const goalField = page.locator("#goal");
    await goalField.click();
    await goalField.pressSequentially(GOAL, { delay: 40 });
    await sleep(800);

    const deviceSelect = page.locator("#device");
    await deviceSelect.scrollIntoViewIfNeeded();
    await deviceSelect.selectOption("phone-and-laptop");
    await sleep(700);

    const hoursSlider = page.locator("#hoursPerWeek");
    await hoursSlider.scrollIntoViewIfNeeded();
    // A range input's value doesn't visually/programmatically update from .fill(); set it directly
    // and dispatch the events React's onChange listens for.
    await hoursSlider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, "10");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await sleep(700);

    const beginnerCheckbox = page.getByLabel(/new to computers/i);
    await beginnerCheckbox.scrollIntoViewIfNeeded();
    await beginnerCheckbox.check();
    await sleep(1000);

    // ---- 3. Submit and wait for the plan to render ----
    const submitButton = page.getByRole("button", { name: "Show my path" });
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();
    await page.getByRole("heading", { name: "Your path" }).waitFor({ state: "visible", timeout: 20_000 });
    await sleep(1800);

    // ---- 4. Slowly scroll through the ordered steps ----
    const stepCards = page.locator('#disha-print-area ol > li');
    const stepCount = await stepCards.count();
    console.log(`Plan rendered with ${stepCount} steps.`);

    // Pause on the first three steps long enough to read why + mini-project + acceptance criteria.
    for (let i = 0; i < Math.min(3, stepCount); i++) {
      await stepCards.nth(i).scrollIntoViewIfNeeded();
      await sleep(3000);
    }

    // Click "Mark done" on the first step to show the progress interaction.
    const firstMarkDone = stepCards.first().getByLabel("Mark done");
    await firstMarkDone.scrollIntoViewIfNeeded();
    await firstMarkDone.check();
    await sleep(1300);

    // Continue scrolling through the remaining steps at a slightly brisker but still readable pace.
    for (let i = 3; i < stepCount; i++) {
      await stepCards.nth(i).scrollIntoViewIfNeeded();
      await sleep(1400);
    }

    // ---- 5. Scroll to the "Where this can lead" work-mapping cards ----
    const workSection = page.locator("section", { has: page.getByRole("heading", { name: "Where this can lead" }) });
    await workSection.scrollIntoViewIfNeeded();
    await sleep(1600);

    const roleCards = workSection.locator(".grid > div");
    const roleCount = await roleCards.count().catch(() => 0);
    for (let i = 0; i < roleCount; i++) {
      await roleCards.nth(i).scrollIntoViewIfNeeded();
      await sleep(2000);
    }

    // Pause on the disclaimer (the section's last direct <p>, after the grid of role cards).
    const disclaimer = workSection.locator("> p").last();
    if (await disclaimer.count()) {
      await disclaimer.scrollIntoViewIfNeeded();
      await sleep(2800);
    }

    // ---- 6. Scroll back to top to end cleanly ----
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(2000);

    console.log("Recording flow complete.");
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    const savedPath = video ? await video.path() : null;
    if (savedPath && existsSync(savedPath)) {
      renameSync(savedPath, FINAL_WEBM);
      console.log("Saved recording to:", FINAL_WEBM);
    } else {
      console.error("No video was saved — recording likely failed before the context closed.");
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
