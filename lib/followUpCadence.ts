import { PostCallOutcome, PostCallStage } from "./types";

export interface CadenceStep {
  day: number;
  type: "text" | "call";
  label: string;
}

export const HOT_STEPS: CadenceStep[] = [
  { day: 1, type: "text", label: "Text to confirm they got the proposal, ask if they've read it" },
  { day: 2, type: "call", label: "Call to book the second call and close" },
  { day: 5, type: "call", label: "Call again (no answer last time)" },
  { day: 10, type: "text", label: "Final text" },
];

export const WARM_STEPS: CadenceStep[] = [
  { day: 3, type: "text", label: "Check-in text" },
  { day: 7, type: "call", label: "Call" },
  { day: 14, type: "text", label: "Final text" },
];

export function stepsFor(outcome: "hot" | "warm"): CadenceStep[] {
  return outcome === "hot" ? HOT_STEPS : WARM_STEPS;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// touchpointIndex is 1-based: 1 means "the first step in the cadence is next/current"
export function firstTouchpointDate(outcome: "hot" | "warm", doneAtIso: string): string {
  return addDays(doneAtIso, stepsFor(outcome)[0].day);
}

export function currentStep(outcome: "hot" | "warm", touchpointIndex: number): CadenceStep | null {
  return stepsFor(outcome)[touchpointIndex - 1] || null;
}

export type TouchpointResult = "no_answer" | "spoke_booked_call" | "spoke_not_ready" | "closed";

export interface AdvanceResult {
  touchpoint_index: number;
  next_touchpoint_at: string | null;
  post_call_stage: PostCallStage;
}

export function advance(
  outcome: PostCallOutcome,
  touchpointIndex: number,
  doneAtIso: string,
  result: TouchpointResult,
  todayIso: string
): AdvanceResult {
  if (result === "closed") {
    return { touchpoint_index: touchpointIndex, next_touchpoint_at: null, post_call_stage: "onboarding" };
  }
  if (result === "spoke_booked_call") {
    return { touchpoint_index: touchpointIndex, next_touchpoint_at: null, post_call_stage: "paused" };
  }

  const steps = stepsFor(outcome as "hot" | "warm");

  if (result === "spoke_not_ready") {
    const step = steps[touchpointIndex - 1];
    const prevDay = touchpointIndex > 1 ? steps[touchpointIndex - 2].day : 0;
    const gap = step.day - prevDay;
    return { touchpoint_index: touchpointIndex, next_touchpoint_at: addDays(todayIso, gap), post_call_stage: "active" };
  }

  // no_answer — advance to the next step, or exhaust the cadence
  const nextIndex = touchpointIndex + 1;
  const nextStep = steps[nextIndex - 1];
  if (!nextStep) {
    return { touchpoint_index: touchpointIndex, next_touchpoint_at: null, post_call_stage: "cold_again" };
  }
  return { touchpoint_index: nextIndex, next_touchpoint_at: addDays(doneAtIso, nextStep.day), post_call_stage: "active" };
}
