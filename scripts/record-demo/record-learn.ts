/**
 * Records a short (~20-35s) clip of the real "Learn" teaching-video flow:
 * the lesson plan for a tiny topic, then the generated teaching VIDEO
 * actually playing (avatar narrating + live captions + its visual/diagram).
 *
 * Nothing here is faked: it drives a real `next dev` server (BASE_URL) with
 * a real lesson session/plan already created via the real
 * POST /api/teach/sessions + background scripting (see
 * scripts/record-demo/README-learn.md or the crew notes for how that
 * session was produced). This script only navigates the real /learn/:id
 * player and lets the real <video> (rendered by the real Playwright/ffmpeg
 * pipeline in lib/video/render.ts, narrated by local macOS `say` since
 * SARVAM_API_KEY is empty) play for real, captured with Playwright's native
 * `recordVideo` (silent — see postprocess step for muxing in narration +
 * background music audio).
 *
 * Usage: LEARN_SESSION_ID=<id> npx tsx scripts/record-demo/record-learn.ts
 * Env: BASE_URL (default http://localhost:3093)
 */
import { chromium } from "playwright";
import { mkdtempSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3093";
const SESSION_ID = process.env.LEARN_SESSION_ID;
const OUT_DIR = path.join(__dirname, "output");
const RAW_VIDEO_DIR = mkdtempSync(path.join(tmpdir(), "learn-demo-"));
const FINAL_WEBM = path.join(OUT_DIR, "learn-demo-raw.webm");

const VIEWPORT = { width: 1000, height: 720 };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!SESSION_ID) {
    console.error("Set LEARN_SESSION_ID to an already-planned+scripted lesson session id.");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: RAW_VIDEO_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(4 * 60_000);
  const recordingStartedAt = Date.now();

  try {
    // ---- 1. Lesson plan: the tiny topic, its one concept, the visual chosen for it ----
    console.log(`Navigating to /learn/${SESSION_ID} ...`);
    await page.goto(`${BASE_URL}/learn/${SESSION_ID}`, { waitUntil: "networkidle" });
    await page.locator("text=Lesson plan").first().waitFor({ state: "visible" });
    await sleep(1200);

    const startButton = page.getByRole("button", { name: "Start the lesson" });
    await startButton.waitFor({ state: "visible", timeout: 60_000 });
    // Scripting already finished before this script ran, so the button is enabled almost
    // immediately — still give the plan a couple of real seconds on screen before starting.
    await sleep(2500);
    await startButton.click();

    // ---- 2. The generated teaching video: avatar narrating + live captions + the visual ----
    // The segment was already rendered once via a direct /api/video call with the same
    // (lessonPlanId, sceneIds, skipTitleCard) inputs, so lib/video/render.ts's per-scene disk
    // cache (keyed by each scene's own html+fps+duration) makes this a fast cache hit rather
    // than a multi-minute real render — still the real render pipeline's real output.
    console.log("Waiting for the teaching video to start playing...");
    await page.waitForFunction(
      () => {
        const v = document.querySelector("video");
        return !!(v && v.readyState >= 2);
      },
      { timeout: 4 * 60_000 },
    );
    await page.evaluate(() => document.querySelector("video")?.play());
    const videoStartedAtMs = Date.now() - recordingStartedAt;
    console.log(`VIDEO_STARTED_AT_MS=${videoStartedAtMs}`);

    // Show a few real seconds of the title card / intro (avatar + captions), then jump ahead to
    // where this concept's own visual (a code/diagram panel next to the avatar) is on screen —
    // the checkpoint-worthy moment the crew brief asks for — rather than sitting through the
    // whole ~28s intro beat in a deliberately short demo clip. Still a real seek on the real
    // <video>, not a stitched-together fake.
    console.log("Playing the title card / intro for ~4s...");
    await sleep(4000);
    const seekToSeconds = 26;
    console.log(`Seeking to ${seekToSeconds}s — this concept's code visual should be on screen...`);
    await page.evaluate((t) => {
      const v = document.querySelector("video") as HTMLVideoElement | null;
      if (v) v.currentTime = t;
    }, seekToSeconds);
    const seekedAtMs = Date.now() - recordingStartedAt;
    console.log(`VIDEO_SEEKED_AT_MS=${seekedAtMs}`);
    await sleep(18_000);

    console.log("Recording flow complete.");
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    const savedPath = video ? await video.path() : null;
    if (savedPath && existsSync(savedPath)) {
      renameSync(savedPath, FINAL_WEBM);
      console.log("Saved raw recording to:", FINAL_WEBM);
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
