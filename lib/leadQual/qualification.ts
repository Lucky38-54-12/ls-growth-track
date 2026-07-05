// Deterministic outcome engine — runs on the LLM's extracted fields, not
// decided by the LLM itself, so "why was this lead rejected" always has a
// rule-based answer instead of a vibe.

export type Rule =
  | { kind: "required_field"; field: string; weight: number }
  | { kind: "equals"; field: string; value: string; weight: number }
  | { kind: "one_of"; field: string; values: string[]; weight: number }
  | { kind: "not_one_of"; field: string; values: string[]; weight: number; readiness?: boolean }
  | { kind: "numeric_min"; field: string; min: number; weight: number };

export type Outcome = "qualified" | "nurture" | "disqualified" | "needs_human";

export interface QualificationResult {
  outcome: Outcome;
  score: number;
  maxScore: number;
  failedRules: Rule[];
}

function ruleField(rule: Rule): string {
  return rule.field;
}

function ruleWeight(rule: Rule): number {
  return rule.weight;
}

function ruleValue(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().trim() : String(value ?? "").toLowerCase().trim();
}

function passes(rule: Rule, extracted: Record<string, unknown>): boolean {
  const value = extracted[ruleField(rule)];
  switch (rule.kind) {
    case "required_field":
      return value !== undefined && value !== null && String(value).trim() !== "";
    case "equals":
      return ruleValue(value) === ruleValue(rule.value);
    // Substring match, not exact equality — these fields come from an LLM's
    // freeform paraphrase of what the lead said (e.g. "just researching" one
    // turn, "just researching for now" the next), so exact-match silently
    // stops catching it the moment the wording drifts even slightly.
    case "one_of":
      return rule.values.some((v) => ruleValue(value).includes(ruleValue(v)));
    case "not_one_of":
      return !rule.values.some((v) => ruleValue(value).includes(ruleValue(v)));
    case "numeric_min": {
      const n = Number(value);
      return !Number.isNaN(n) && n >= rule.min;
    }
  }
}

export interface EvaluateInput {
  rules: Rule[];
  extracted: Record<string, unknown>;
  confidence: number;
  lowConfidenceThreshold?: number;
}

export function evaluate({ rules, extracted, confidence, lowConfidenceThreshold = 0.5 }: EvaluateInput): QualificationResult {
  // needs_human first — ambiguity should never get silently scored as a
  // rejection. Any required_field the model is unsure about routes to a
  // human instead of guessing.
  const unresolvedRequired = rules.filter(
    (r) => r.kind === "required_field" && !passes(r, extracted)
  );
  if (unresolvedRequired.length > 0 && confidence < lowConfidenceThreshold) {
    return { outcome: "needs_human", score: 0, maxScore: totalWeight(rules), failedRules: unresolvedRequired };
  }

  const failedRules = rules.filter((r) => !passes(r, extracted));
  const maxScore = totalWeight(rules);
  const score = maxScore - failedRules.reduce((sum, r) => sum + ruleWeight(r), 0);

  // A "readiness" rule failing (e.g. timeline = "just researching") means
  // the lead is a real fit but not ready to book — nurture, not reject.
  const failedReadinessOnly =
    failedRules.length > 0 && failedRules.every((r) => r.kind === "not_one_of" && r.readiness);

  if (failedRules.length === 0) {
    return { outcome: "qualified", score, maxScore, failedRules: [] };
  }
  if (failedReadinessOnly) {
    return { outcome: "nurture", score, maxScore, failedRules };
  }
  return { outcome: "disqualified", score, maxScore, failedRules };
}

function totalWeight(rules: Rule[]): number {
  return rules.reduce((sum, r) => sum + ruleWeight(r), 0);
}

// A sensible starting rule set for a new client, editable afterward —
// avoids shipping an empty rules array that would auto-qualify everything.
export function defaultRules(): Rule[] {
  return [
    { kind: "required_field", field: "job_type", weight: 2 },
    { kind: "required_field", field: "location", weight: 2 },
    { kind: "not_one_of", field: "timeline", values: ["just researching", "not sure", "no rush"], weight: 1, readiness: true },
  ];
}
