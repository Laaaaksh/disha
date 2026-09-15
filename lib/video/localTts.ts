import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { LanguageCode } from "../types";

const execFileAsync = promisify(execFile);

/**
 * $0/keyless TTS fallback for the Learn teaching video: macOS's built-in
 * `say` command, used whenever SARVAM_API_KEY is unset (see narrate.ts).
 * `say --data-format=LEI16@22050` writes mono 16-bit PCM WAV at 22050Hz —
 * the exact shape lib/video/wav.ts:decodeWav already parses (verified: its
 * chunk walker also tolerates the extra JUNK/FLLR chunks afconvert emits),
 * so the rest of the narrate()/render() pipeline needs no changes.
 */
const SAY_SAMPLE_RATE = 22050;

/** Voice preferred per language; falls back to the system default voice (mapVoiceForLanguage) if not installed. */
const VOICE_BY_LANGUAGE: Partial<Record<LanguageCode, string>> = {
  "hi-IN": "Lekha",
};
/** English/hinglish/anything without a specific mapping — "Aman" is the en_IN (Indian-English) voice, closest to the app's Indian-learner audience. */
const DEFAULT_VOICE = "Aman";

let cachedVoices: Set<string> | undefined;

/**
 * Queries `say -v '?'` for installed voice names (cached for the process
 * lifetime — the voice list can't change mid-run). Never throws: if the
 * query itself fails, we treat it as "no voices known" so callers fall back
 * to the system default voice instead of crashing narration.
 */
async function listInstalledVoices(): Promise<Set<string>> {
  if (cachedVoices) return cachedVoices;
  try {
    const { stdout } = await execFileAsync("/usr/bin/say", ["-v", "?"]);
    cachedVoices = new Set(
      stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s{2,}/)[0]?.trim())
        .filter((name): name is string => Boolean(name)),
    );
  } catch {
    cachedVoices = new Set();
  }
  return cachedVoices;
}

/**
 * Resolves the `say` voice for a language, guarding against a voice that
 * isn't actually installed on this machine (Lekha/Aman ship with macOS but
 * aren't guaranteed present in every locale/OS-version install) by falling
 * back to the system default voice (omitting `-v` entirely) rather than
 * letting `say` error out and breaking narration.
 */
async function resolveVoice(language: LanguageCode): Promise<string | undefined> {
  const preferred = VOICE_BY_LANGUAGE[language] ?? DEFAULT_VOICE;
  const installed = await listInstalledVoices();
  if (installed.size === 0 || installed.has(preferred)) return preferred;
  return undefined; // unknown install state or voice missing -> let `say` use its system default
}

export interface LocalTextToSpeechParams {
  text: string;
  language: LanguageCode;
}

export interface LocalTextToSpeechResult {
  audio: Buffer;
  raw: unknown;
}

/**
 * Local, keyless TTS via macOS `say`. Uses execFile with an argument array
 * (never a shell) so narration text — which can contain arbitrary
 * user/LLM-generated content, including shell metacharacters — is passed as
 * a single argv element and can never be interpreted as a shell command.
 */
export async function localTextToSpeech(params: LocalTextToSpeechParams): Promise<LocalTextToSpeechResult> {
  const voice = await resolveVoice(params.language);
  const tmpPath = path.join(os.tmpdir(), `disha-say-${randomUUID()}.wav`);

  const args = [
    ...(voice ? ["-v", voice] : []),
    "-o",
    tmpPath,
    `--data-format=LEI16@${SAY_SAMPLE_RATE}`,
    params.text,
  ];

  try {
    const { stdout, stderr } = await execFileAsync("/usr/bin/say", args);
    const audio = fs.readFileSync(tmpPath);
    return { audio, raw: { voice: voice ?? "(system default)", stdout, stderr } };
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}
