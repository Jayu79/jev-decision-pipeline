import type { CoverageAt, HeroSeries, Model, Strategy } from "./types";

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

/**
 * For each accuracy target, the two-decimal cutoff (0.00 to 1.00) that hands Jev
 * the most tickets while staying at or above the target, with its coverage
 * recomputed at exactly that cutoff. The page prints cutoffs with two decimals,
 * so it uses these instead of the exact cutoffs in summary.json: a rounded exact
 * cutoff (0.9205 shown as 0.92) can cover tickets that miss the target.
 */
export function gridCutoffs(s: Pick<HeroSeries, "confidence" | "correct">, targets: number[]): CoverageAt[] {
  return targets.map((target) => {
    let best: CoverageAt = { target, coverage: 0, n_covered: 0, cutoff: null };
    for (let k = 0; k <= 100; k++) {
      const c = k / 100;
      const r = readout(s, c);
      if (r.handled > 0 && r.correct / r.handled >= target && r.handled > best.n_covered) {
        best = { target, coverage: r.handled / r.n, n_covered: r.handled, cutoff: c };
      }
    }
    return best;
  });
}
