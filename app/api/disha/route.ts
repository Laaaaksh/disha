import { NextRequest, NextResponse } from "next/server";
import { generateDishaPlan } from "@/lib/disha/generate";

export const runtime = "nodejs";

/**
 * POST /api/disha — the sole entry point for the "what should I learn next?"
 * guidance tool. Body: { intake: DishaIntake, completedStepOrders?: number[] }.
 * Response: a DishaPlan (200) or { error: string } (500). Validation of the
 * intake shape and grounding of every resourceId/work category against the
 * static catalogue happens inside generateDishaPlan(); this route stays a
 * thin pass-through so the UI crew's contract is easy to reason about.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => undefined);

  if (!body || typeof body !== "object" || !("intake" in body)) {
    return NextResponse.json({ error: "Request body must include an 'intake' object." }, { status: 500 });
  }

  try {
    const plan = await generateDishaPlan({
      intake: body.intake,
      completedStepOrders: body.completedStepOrders,
    });
    return NextResponse.json(plan);
  } catch (err) {
    console.error("Disha plan generation failed:", err);
    return NextResponse.json({ error: "Failed to generate a Disha plan." }, { status: 500 });
  }
}
