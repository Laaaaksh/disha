/**
 * Records a smooth ~25-40s MP4 demo of the /rag-demo flow using Playwright's
 * native video recording: upload evals/fixtures/electricity-basics.pdf, watch
 * it index, ask a question the material actually covers, and show Claude's
 * grounded answer with its citations rendering.
 *
 * COST SAFETY: this drives whatever server is already running at BASE_URL
 * (start it yourself: `PORT=3092 npm run dev`, with ANTHROPIC_API_KEY set in
 * .env.local). The Ask button is clicked exactly ONCE in this script — that
 * single click is the only Anthropic API call this recording makes (lib/rag/
 * ground.ts -> lib/teach/claude.ts). Do not add a second question or a retry
 * loop here; if a take fails, fix the selector/timing and re-run the whole
 * script rather than looping the ask step alone.
 *
 * Usage: npx tsx scripts/record-demo/record-rag.ts
 * Env: BASE_URL (default http://localhost:3092)
 */
import { chromium } from "playwright";
import { mkdtempSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3092";
const OUT_DIR = path.join(__dirname, "output");
const RAW_VIDEO_DIR = mkdtempSync(path.join(tmpdir(), "rag-demo-"));
const FINAL_WEBM = path.join(OUT_DIR, "rag-demo-raw.webm");
const FIXTURE_PDF = path.join(__dirname, "..", "..", "evals", "fixtures", "electricity-basics.pdf");

// Text-heavy demo (document list, outline, answer + citations) reads better
// at a taller desktop viewport than the phone-width used for the mobile-first
// /disha recorder.
const VIEWPORT = { width: 1000, height: 800 };

const QUESTION = "What is Ohm's Law?";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(FIXTURE_PDF)) {
    throw new Error(`Fixture not found: ${FIXTURE_PDF}`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: RAW_VIDEO_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  try {
    // ---- 1. Land on /rag-demo, let the header breathe ----
    console.log("Navigating to /rag-demo ...");
    await page.goto(`${BASE_URL}/rag-demo`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "RAG demo" }).waitFor({ state: "visible" });
    await sleep(2800);

    // ---- 2. Upload the fixture document, visibly ----
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PDF);
    await sleep(600);

    const uploadButton = page.getByRole("button", { name: "Upload" });
    await uploadButton.click();
    // Uploading… -> Upload (button label reverts once the POST resolves and
    // the document list refreshes). Documents list newest-first (ORDER BY
    // uploaded_at DESC — lib/db/accessors/documents.ts), and re-running this
    // script against a server that already has an earlier take's upload in
    // its sqlite file means more than one "electricity-basics" button can be
    // in the DOM — always target .first() (the just-uploaded one), never a
    // bare name match that trips Playwright's strict-mode multi-match error.
    const docButton = page.getByRole("button", { name: "electricity-basics", exact: false }).first();
    await docButton.waitFor({ state: "visible", timeout: 20_000 });
    await sleep(1000);

    // ---- 3. Select the uploaded document and watch it index ----
    await docButton.scrollIntoViewIfNeeded();
    await docButton.click();

    const indexingHeading = page.getByRole("heading", { name: "Indexing" });
    await indexingHeading.waitFor({ state: "visible" });
    await indexingHeading.scrollIntoViewIfNeeded();
    // Small fixture (3 chunks) indexes in well under a second — hold on the
    // "ready" state briefly so the progress bar is legible rather than a blip.
    await page.getByText(/chunks embedded — ready\./).waitFor({ state: "visible", timeout: 15_000 });
    await sleep(3200);

    // ---- 4. Scroll to the Ask panel and ask a question the document covers ----
    // (Chapter outline is skipped: it runs through Sarvam, which this demo
    // environment doesn't have a key for — not part of the RAG/Claude story
    // this recording is showing anyway.)
    const askHeading = page.getByRole("heading", { name: "Ask this document" });
    await askHeading.scrollIntoViewIfNeeded();
    await sleep(1000);

    const questionBox = page.getByPlaceholder(/Ask about a concept/i);
    await questionBox.click();
    await questionBox.pressSequentially(QUESTION, { delay: 70 });
    await sleep(1400);

    // ---- 5. Submit — the one real Anthropic API call this script makes ----
    const askButton = page.getByRole("button", { name: "Ask", exact: true });
    await askButton.click();
    console.log("Waiting for Claude's grounded answer...");
    await page.getByText(/Grounded in the material|Not covered/).waitFor({ state: "visible", timeout: 45_000 });
    await sleep(2200);

    // ---- 6. Hold on the answer, then slowly reveal the citations ----
    const citationsLabel = page.getByText("Citations");
    if (await citationsLabel.count()) {
      await citationsLabel.scrollIntoViewIfNeeded();
      await sleep(3500);
      // Scroll a little further so later citation cards (page 2/3 excerpts) are visible too.
      await page.mouse.wheel(0, 300);
      await sleep(6000);
    } else {
      await sleep(8000);
    }

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
