/**
 * Claude (Anthropic) is Disha's reasoning brain: learning-path generation,
 * lesson planning, answer evaluation, adaptation, and the new work-mapping.
 * Voice, translation and speech-to-text stay on Sarvam (lib/sarvam) — Claude
 * doesn't do those — so this file replaces ONLY the structured-text `json()`
 * call the teaching engine depends on.
 *
 * It deliberately mirrors lib/sarvam's `json()` contract one-for-one:
 *   - same signature: json(schema, { messages, maxTokens, temperature, timeoutMs })
 *   - same one-repair-then-throw behaviour on malformed/unschematic output
 *   - throws the SAME typed `SarvamError` kinds, so lib/teach/llm.ts's outer
 *     retry (`RETRYABLE_KINDS`) and every caller's `isSarvamError` branch keep
 *     working unchanged. (The error class name is historical; treat it as the
 *     teaching engine's shared LLM-error type, not a Sarvam-specific one.)
 *
 * The model id is a config knob (ANTHROPIC_MODEL) with a current default, so if
 * a model id is ever retired the demo is fixed by an env var, not a code edit.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { SarvamError } from "../sarvam/errors";
import type { ChatMessage } from "../sarvam";

/** Latest Sonnet by default; override without a code change via ANTHROPIC_MODEL. */
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
/** Claude requires an explicit max_tokens; these JSON payloads are small. */
const DEFAULT_MAX_TOKENS = 8000;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fail loud and early with the exact fix, rather than a cryptic 401 mid-lesson.
    throw new SarvamError("config", "ANTHROPIC_API_KEY is not set — add it to .env.local. See .env.example.");
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export interface JsonRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1).trim();
  return text.trim();
}

/** Anthropic wants system prompts separate from the turn list; Sarvam interleaved them. */
function splitMessages(messages: ChatMessage[]): { system: string; turns: Anthropic.MessageParam[] } {
  const systemParts: string[] = [];
  const turns: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else {
      turns.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
    }
  }
  // Claude requires the conversation to start with a user turn.
  if (turns.length === 0 || turns[0].role !== "user") {
    turns.unshift({ role: "user", content: "Respond now, following the instructions above." });
  }
  return { system: systemParts.join("\n\n"), turns };
}

function mapError(err: unknown): SarvamError {
  if (err instanceof SarvamError) return err;
  const e = err as { name?: string; status?: number; message?: string };
  if (e?.name === "APIConnectionTimeoutError") return new SarvamError("timeout", `Claude request timed out: ${e.message}`);
  if (e?.name === "APIConnectionError") return new SarvamError("network", `Claude connection failed: ${e.message}`, { cause: err });
  if (typeof e?.status === "number") return new SarvamError("http", `Claude HTTP ${e.status}: ${e.message}`, { status: e.status, cause: err });
  return new SarvamError("network", `Claude call failed: ${e?.message ?? String(err)}`, { cause: err });
}

/**
 * Ask Claude for JSON matching `schema`. On malformed/unschematic output, retry
 * once with the parse error fed back, then throw a typed SarvamError — identical
 * behaviour and error surface to lib/sarvam's json(), so callers don't change.
 */
export async function json<T>(schema: z.ZodType<T>, req: JsonRequest): Promise<T> {
  const anthropic = getClient();

  const attempt = async (
    messages: ChatMessage[],
  ): Promise<{ value?: T; error?: string; errorKind?: "invalid-json" | "invalid-schema" | "truncated"; rawContent: string }> => {
    const { system, turns } = splitMessages(messages);
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create(
        {
          model: DEFAULT_MODEL,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: req.temperature ?? 0.2,
          system: system + "\n\nReply with ONLY a single JSON object — no prose, no markdown fences.",
          messages: turns,
        },
        req.timeoutMs ? { timeout: req.timeoutMs } : undefined,
      );
    } catch (err) {
      throw mapError(err);
    }

    const rawContent = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (resp.stop_reason === "max_tokens") {
      return { error: "Response hit max_tokens before completing.", errorKind: "truncated", rawContent };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonBlock(rawContent));
    } catch (err) {
      return { error: `Invalid JSON: ${(err as Error).message}`, errorKind: "invalid-json", rawContent };
    }

    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      return { error: `Schema validation failed: ${validated.error.message}`, errorKind: "invalid-schema", rawContent };
    }
    return { value: validated.data, rawContent };
  };

  const first = await attempt(req.messages);
  if (first.value !== undefined) return first.value;

  const repairMessages: ChatMessage[] = [
    ...req.messages,
    { role: "assistant", content: first.rawContent },
    {
      role: "user",
      content: `That response was not valid JSON matching the required schema. Error: ${first.error}. Reply again with ONLY the corrected JSON object, no commentary, no markdown fences.`,
    },
  ];

  const second = await attempt(repairMessages);
  if (second.value !== undefined) return second.value;

  const kind = second.errorKind ?? "invalid-json";
  const what = kind === "invalid-schema" ? "JSON that does not match the required schema" : "malformed JSON";
  throw new SarvamError(kind, `Claude returned ${what} after one repair attempt: ${second.error}`);
}
