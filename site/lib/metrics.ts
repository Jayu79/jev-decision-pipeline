import type { HeroSeries, Model, Strategy } from "./types";

/** What the hero shows first. */
export const DEFAULT = { model: "jev-1.13.0" as Model, strategy: "flat" as Strategy, cut: 0.97 };

// Confidences are rounded to 4 decimals, so this only absorbs float noise in the cutoff.
const EPS = 1e-9;

export type Readout = { n: number; handled: number; correct: number; mistakes: number; toPerson: number };

/** Covered = every ticket with confidence >= cutoff; ties are counted whole. */
export function readout(s: Pick<HeroSeries, "confidence" | "correct">, cut: number): Readout {
  const conf = s.confidence;
  // conf is sorted descending: find the first index below the cutoff.
  let lo = 0;
  let hi = conf.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (conf[mid] >= cut - EPS) lo = mid + 1;
    else hi = mid;
  }
  let correct = 0;
  for (let i = 0; i < lo; i++) correct += s.correct[i];
  return { n: conf.length, handled: lo, correct, mistakes: lo - correct, toPerson: conf.length - lo };
}
