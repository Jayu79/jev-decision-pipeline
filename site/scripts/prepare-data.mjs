// Copies the exported results into public/ and derives hero.json.
//
// Source: ../site-data (written by `python -m jevpipe.export_site_data`).
// If it isn't there, the committed copy in public/data is used as is.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(site, "..", "site-data");
const out = join(site, "public", "data");
const reportsSrc = join(site, "..", "reports");
const reportsOut = join(site, "public", "reports");

export const MODELS = ["jev-1.13.0", "jev-1.14.0"];
export const STRATEGIES = ["flat", "fanout"];

mkdirSync(out, { recursive: true });
if (existsSync(src)) {
  for (const f of readdirSync(src).filter((f) => f.endsWith(".json"))) copyFileSync(join(src, f), join(out, f));
  console.log(`copied ${src} -> ${out}`);
} else {
  console.log(`no ${src}; using committed ${out}`);
}

// The two calibration reports are self-contained pages; serve them as is.
if (existsSync(reportsSrc)) {
  mkdirSync(reportsOut, { recursive: true });
  for (const f of readdirSync(reportsSrc).filter((f) => f.endsWith(".html"))) copyFileSync(join(reportsSrc, f), join(reportsOut, f));
}

const read = (f) => JSON.parse(readFileSync(join(out, f), "utf8"));
const tickets = read("tickets.json");
const ticketIndex = new Map(tickets.rows.map((r, i) => [r[0], i]));

// For each model x strategy: every ticket sorted by confidence (highest first),
// with whether Jev was right and which ticket it is (index into tickets.json).
const hero = {};
for (const model of MODELS) {
  hero[model] = {};
  for (const strategy of STRATEGIES) {
    const d = read(`decisions_${model}_${strategy}.json`);
    const col = Object.fromEntries(d.columns.map((c, i) => [c, i]));
    const rows = d.rows.map((r) => {
      const t = ticketIndex.get(r[col.event_id]);
      if (t === undefined) throw new Error(`${model} ${strategy}: ${r[col.event_id]} not in tickets.json`);
      return [r[col.confidence], r[col.correct], t];
    });
    rows.sort((a, b) => b[0] - a[0] || a[2] - b[2]);
    hero[model][strategy] = {
      confidence: rows.map((r) => r[0]),
      correct: rows.map((r) => r[1]),
      ticket: rows.map((r) => r[2]),
    };
  }
}
writeFileSync(join(out, "hero.json"), JSON.stringify(hero));
console.log(`wrote hero.json (${(JSON.stringify(hero).length / 1024).toFixed(0)} KB)`);
