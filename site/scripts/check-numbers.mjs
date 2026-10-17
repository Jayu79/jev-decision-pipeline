// Recomputes the headline numbers straight from the per-ticket data and checks
// that summary.json, hero.json and the built page all agree with them.
//
//   npm run build && npm run check
//
// Exits non-zero on any mismatch.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = (f) => JSON.parse(readFileSync(join(site, "public", "data", f), "utf8"));
const summary = data("summary.json");
const hero = data("hero.json");

const EXPECTED = [
  { model: "jev-1.13.0", strategy: "flat", accuracy: "81.6%", ece: "0.096", target: 0.95, cutoff: 0.97, handled: "64.5%" },
  { model: "jev-1.14.0", strategy: "flat", accuracy: "81.4%", ece: "0.085", target: 0.95, cutoff: 0.95, handled: "63.6%" },
  { model: "jev-1.14.0", strategy: "flat", target: 0.9, cutoff: 0.77, handled: "81.9%" },
];

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

// Built page text, with React's text-boundary comments and tags removed.
const html = readFileSync(join(site, "out", "index.html"), "utf8")
  .replace(/<!-- -->/g, "")
  .replace(/<\/?span[^>]*>/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;/g, "'")
  .replace(/\s+/g, " ");

for (const e of EXPECTED) {
  const name = `${e.model} ${e.strategy}`;
  const d = data(`decisions_${e.model}_${e.strategy}.json`);
  const col = Object.fromEntries(d.columns.map((c, i) => [c, i]));
  const rows = d.rows;
  const s = summary[e.model][e.strategy];

  // Covered = every ticket with confidence >= cutoff, ties counted whole.
  const covered = rows.filter((r) => r[col.confidence] >= e.cutoff);
  const coverage = covered.length / rows.length;
  const coveredAcc = covered.reduce((a, r) => a + r[col.correct], 0) / covered.length;
  check(pct(coverage) === e.handled, `${name}: ${covered.length}/${rows.length} at confidence >= ${e.cutoff} = ${pct(coverage)} (expected ${e.handled})`);
  check(coveredAcc >= e.target, `${name}: accuracy on those ${pct(coveredAcc)} >= ${pct(e.target)}`);

  const at = s.coverage_at.find((c) => c.target === e.target);
  check(at.cutoff === e.cutoff && at.coverage === coverage, `${name}: summary.json coverage at ${pct(e.target)} is ${pct(at.coverage)} at cutoff ${at.cutoff}`);

  const h = hero[e.model][e.strategy];
  const heroHandled = h.confidence.filter((c) => c >= e.cutoff).length;
  check(heroHandled === covered.length, `${name}: hero.json gives the same ${heroHandled} tickets`);

  if (e.accuracy) {
    const acc = rows.reduce((a, r) => a + r[col.correct], 0) / rows.length;
    check(pct(acc) === e.accuracy && acc === s.accuracy, `${name}: accuracy ${pct(acc)} (expected ${e.accuracy})`);
    check(s.ece.toFixed(3) === e.ece, `${name}: ECE ${s.ece.toFixed(3)} (expected ${e.ece})`);
    // ECE again from the reliability bins: weighted mean |accuracy - stated|.
    const n = s.reliability.reduce((a, b) => a + b.n, 0);
    const ece = s.reliability.reduce((a, b) => a + b.n * Math.abs(b.accuracy - b.mean_p), 0) / n;
    check(ece.toFixed(3) === e.ece, `${name}: ECE recomputed from reliability bins ${ece.toFixed(3)}`);
    check(html.includes(` ${e.accuracy} `) && html.includes(` ${e.ece} `), `${name}: page shows ${e.accuracy} and ${e.ece}`);
  }
  check(html.includes(`${e.handled} cutoff ${e.cutoff.toFixed(2)}`), `comparison table shows ${e.handled} at cutoff ${e.cutoff.toFixed(2)}`);
}

// The hero's default state: jev-1.13.0, flat, cutoff 0.97.
const def = hero["jev-1.13.0"].flat;
const handled = def.confidence.filter((c) => c >= 0.97).length;
check(/handled by Jev 64\.5% /.test(html), `default view shows 64.5% handled by Jev (${handled} tickets)`);
check(html.includes("Measured: 64.5% at 95% accuracy"), 'masthead tag reads "Measured: 64.5% at 95% accuracy"');
check(html.includes(`${handled.toLocaleString("en-US")} tickets`), `default hero shows ${handled.toLocaleString("en-US")} tickets`);

// Footnotes are numbered in reading order: the superscript markers appear as 1, 2, 3, ...
const rawHtml = readFileSync(join(site, "out", "index.html"), "utf8");
const refs = [...rawHtml.matchAll(/id="ref-(\d+)"/g)].map((m) => Number(m[1]));
const notes = new Set([...rawHtml.matchAll(/id="note-(\d+)"/g)].map((m) => Number(m[1])));
check(
  refs.length > 0 && refs.every((n, i) => n === i + 1) && refs.every((n) => notes.has(n)),
  `footnote markers in document order: ${refs.join(", ")}; each has its note`,
);

// Cutoffs on the page have two decimals, and each is the best cutoff on a 0.01 grid
// for its target, recomputed here from the per-ticket data (the raw cutoffs above stay
// in summary.json and the reports).
const printed = [...html.matchAll(/cutoff (\d\.\d+)/g)].map((m) => m[1]);
check(printed.length > 0 && printed.every((c) => /^\d\.\d{2}$/.test(c)), `every printed cutoff has two decimals (${printed.length} found)`);
for (const model of ["jev-1.13.0", "jev-1.14.0"]) {
  for (const strategy of ["flat", "fanout"]) {
    const d = data(`decisions_${model}_${strategy}.json`);
    const col = Object.fromEntries(d.columns.map((c, i) => [c, i]));
    for (const target of [0.9, 0.95, 0.98]) {
      let best = null;
      for (let k = 0; k <= 100; k++) {
        const c = k / 100;
        const cov = d.rows.filter((r) => r[col.confidence] >= c - 1e-9);
        const acc = cov.reduce((a, r) => a + r[col.correct], 0) / cov.length;
        if (cov.length && acc >= target && (!best || cov.length > best.n)) best = { c, n: cov.length };
      }
      if (best) {
        const shown = `${pct(best.n / d.rows.length)} cutoff ${best.c.toFixed(2)}`;
        check(html.includes(shown), `${model} ${strategy} at ${pct(target)}: page shows "${shown}"`);
      }
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} mismatch(es):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nAll numbers match.");
