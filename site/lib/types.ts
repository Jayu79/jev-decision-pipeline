export const MODELS = ["jev-1.13.0", "jev-1.14.0"] as const;
export const STRATEGIES = ["flat", "fanout"] as const;
export type Model = (typeof MODELS)[number];
export type Strategy = (typeof STRATEGIES)[number];

export const STRATEGY_LABEL: Record<Strategy, string> = {
  flat: "Flat 77-way",
  fanout: "Fan-out: area, then intent",
};

export type ReliabilityBin = { bin: number; lo: number; hi: number; n: number; mean_p: number; accuracy: number };
export type CoverageAt = { target: number; coverage: number; n_covered: number; cutoff: number | null };

export type StrategySummary = {
  n: number;
  n_correct: number;
  accuracy: number;
  mean_stated_confidence: number;
  ece: number;
  brier: number;
  reliability: ReliabilityBin[];
  coverage_at: CoverageAt[];
  coverage_curve: { columns: string[]; rows: [number, number, number][] };
};
export type Summary = Record<Model, Record<Strategy, StrategySummary>>;

export type ModelMeta = {
  model_served: string;
  model_requested: string;
  models_served: string[];
  calls_ok: number;
  calls_failed: number;
  latency_ms: { p50: number; p95: number; p99: number };
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  first_call_utc: string;
  last_call_utc: string;
  question_version: string;
  questions_per_call: number;
};
export type Area = { area: string; description: string; intents: { intent: string; description: string }[] };
export type Meta = { models: Record<Model, ModelMeta>; areas: Area[]; source: Record<string, string> };

/** Per model x strategy, every ticket sorted by confidence (highest first). */
export type HeroSeries = { confidence: number[]; correct: number[]; ticket: number[] };
export type Hero = Record<Model, Record<Strategy, HeroSeries>>;

/** tickets.json rows: [event_id, text, label, area] */
export type TicketRow = [string, string, string, string];
/** decisions_*.json rows: [event_id, intent, p_intent, confidence, correct, request_id, top5] */
export type DecisionRow = [string, string, number, number, number, string, [string, number][]];
