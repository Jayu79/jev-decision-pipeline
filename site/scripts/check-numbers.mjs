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

// Built page text as a reader sees it: numbers are drawn twice (a tabular copy
// hidden from screen readers, and a plain copy for them), so keep the plain one.
const dropHidden = (s) => {
  let out = "";
  let i = 0;
  const open = '<span aria-hidden="true" class="select-none">';
  for (let at = s.indexOf(open); at >= 0; at = s.indexOf(open, i)) {
    out += s.slice(i, at);
    let depth = 0;
    let j = at;
    do {
      const o = s.indexOf("<span", j + 1);
      const c = s.indexOf("</span>", j + 1);
      if (o >= 0 && o < c) { depth++; j = o; } else { depth--; j = c; }
    } while (depth >= 0);
    i = j + "</span>".length;
  }
  return out + s.slice(i);
};
const html = dropHidden(readFileSync(join(site, "out", "index.html"), "utf8"))
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
check(/Handled by Jev 64\.5% /.test(html), `default hero shows "Handled by Jev 64.5%" (${handled} tickets)`);
check(html.includes(`${handled.toLocaleString("en-US")} tickets`), `default hero shows ${handled.toLocaleString("en-US")} tickets`);

if (failures.length) {
  console.error(`\n${failures.length} mismatch(es):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nAll numbers match.");
