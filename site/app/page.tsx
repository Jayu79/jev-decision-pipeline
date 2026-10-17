import type { Metadata } from "next";
import { Explorer } from "@/components/Explorer";
import { Instrument } from "@/components/Instrument";
import { Caption, Grid, Note, Para, Ref, Section, Whole } from "@/components/Layout";
import { Reliability, ReliabilityTable } from "@/components/Reliability";
import { Schematic, type Step } from "@/components/Schematic";
import { SiteState } from "@/components/SiteState";
import { getDecisions, getHero, getMeta, getSummary, getTicketCount } from "@/lib/data";
import { cutoff, int, pct } from "@/lib/format";
import { DEFAULT, gridCutoffs, readout } from "@/lib/metrics";
import { OG_IMAGE } from "@/lib/og";
import { MODELS, STRATEGIES, type CoverageAt, type Model, type ReliabilityBin, type Strategy } from "@/lib/types";

const REPO = "https://github.com/Jayu79/jev-decision-pipeline";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const summary = getSummary();
const meta = getMeta();
const nTickets = getTicketCount();
const nIntents = meta.areas.reduce((n, a) => n + a.intents.length, 0);
const [M13, M14] = MODELS;
const at = (c: CoverageAt[], target: number) => c.find((x) => Math.abs(x.target - target) < 1e-9) as CoverageAt;

export function generateMetadata(): Metadata {
  const description = `${pct(headline.coverage)} of ${int(nTickets)} banking support tickets handled at 95% accuracy. A calibration study of TypeSafe's Jev (${M13} and ${M14}) by Jayanth Veeramachaneni.`;
  return {
    description,
    openGraph: {
      title: "Jev, calibrated",
      description,
      type: "article",
      url: `https://jayu79.github.io${BASE}/`,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: "Jev, calibrated", description, images: [OG_IMAGE] },
  };
}

const byModel = <T,>(f: (m: Model, s: Strategy) => T) =>
  Object.fromEntries(MODELS.map((m) => [m, Object.fromEntries(STRATEGIES.map((s) => [s, f(m, s)]))])) as Record<
    Model,
    Record<Strategy, T>
  >;

const hero = getHero();
const targets = summary[M13].flat.coverage_at.map((c) => c.target);
/** Two-decimal cutoffs for every target, recomputed from the tickets (see gridCutoffs). */
const grid = byModel((m, s) => gridCutoffs(hero[m][s], targets));
const headline = at(grid[DEFAULT.model][DEFAULT.strategy], 0.95);

/** Weighted stated probability and accuracy over the reliability bins at or above `from`. */
function above(bins: ReliabilityBin[], from: number) {
  const bs = bins.filter((b) => b.lo >= from - 1e-9);
  const n = bs.reduce((a, b) => a + b.n, 0);
  return {
    n,
    stated: bs.reduce((a, b) => a + b.n * b.mean_p, 0) / n,
    right: bs.reduce((a, b) => a + b.n * b.accuracy, 0) / n,
  };
}

/** Count of calls with a TypeSafe request ID, per model (both strategies share one call). */
const requestIds = Object.fromEntries(
  MODELS.map((m) => [m, new Set(getDecisions(m, "flat").rows.map((r) => r[5]).filter(Boolean)).size]),
) as Record<Model, number>;

function runMonth() {
  const d = new Date(`${meta.models[M13].first_call_utc.replace(" ", "T")}Z`);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function Page() {
  const coverageAt = grid;
  const bins = byModel((m, s) => summary[m][s].reliability);
  const initial = readout(hero[DEFAULT.model][DEFAULT.strategy], DEFAULT.cut);
  const f13 = summary[M13].flat;
  const f14 = summary[M14].flat;
  const o13 = summary[M13].fanout;
  const o14 = summary[M14].fanout;
  const hi = above(f13.reliability, 0.8);
  const gapPts = Math.round((hi.stated - hi.right) * 100);

  return (
    <SiteState>
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Masthead />
        <main>
          <section id="instrument" aria-labelledby="instrument-title" className="mt-14">
            <Grid>
              <h2 id="instrument-title" className="display text-xl wide:col-span-8">
                Where would you set the cutoff?
              </h2>
            </Grid>
            <Para className="mt-5">
              I streamed {int(nTickets)} real banking support messages through Kafka and ClickHouse and asked TypeSafe&apos;s
              Jev to sort each into one of {nIntents} intents. Jev says how sure it is. Choose a cutoff, and every ticket at
              or above it is handled by Jev alone; the rest go to a person.
            </Para>
            <Instrument nIntents={nIntents} coverageAt={coverageAt} initial={initial} initialBits={hero[DEFAULT.model][DEFAULT.strategy].correct.join("")} />
          </section>

          <Section id="calibration" title="Is Jev's confidence honest?" space="mt-32">
            <figure className="mt-8 grid grid-cols-1 gap-x-6 gap-y-8 wide:grid-cols-12">
              <div className="wide:col-span-6">
                <Reliability bins={bins} />
                <Caption n={2}>
                  Reliability. Tickets are grouped by the probability Jev gave its own pick, in bins of 0.1; marker size
                  shows how many tickets each bin holds. Circles are {M13}, squares {M14}. The dashed line is perfect
                  calibration.
                </Caption>
                <ReliabilityTable bins={bins} />
              </div>
              <div className="-order-1 wide:order-none wide:col-span-5 wide:col-start-7">
                <p className="prose-text">
                  If Jev were calibrated, every point would sit on the dashed line: when it says 90%, it would be right
                  90% of the time.
                </p>
                <p className="prose-text mt-5">
                  <Whole>
                  It isn&apos;t, quite. On the flat question, {M13} is about {gapPts} points overconfident above 0.8: it
                  stated {pct(hi.stated)} on average and was right {pct(hi.right)} of the time, across {int(hi.n)}{" "}
                  tickets. Expected calibration error is {f13.ece.toFixed(3)} for {M13} and {f14.ece.toFixed(3)} for{" "}
                  {`${M14}; on fan-out, ${o13.ece.toFixed(3)} and ${o14.ece.toFixed(3)}.`}
                  </Whole>
                  <Ref n={2} />
                </p>
                <p className="prose-text mt-5">
                  Confidence still ranks answers well: higher really is more accurate. That is why a measured cutoff works
                  even though the raw number can&apos;t be read as a probability.
                </p>
                <Note n={2} className="wide:col-span-full wide:col-start-auto wide:mt-6">
                  Expected calibration error is the ticket-weighted average gap between stated probability and accuracy
                  across the ten bins. Lower is better; zero is perfect.
                </Note>
              </div>
            </figure>
          </Section>

          <Section id="compare" title="1.13 vs 1.14" space="mt-24">
            <Comparison />
          </Section>

          <Section id="explorer" title="Read the tickets" space="mt-32">
            <Para
              className="mt-5"
              n={4}
              note="Confident and wrong means confidence 0.9 or higher with the wrong intent: the mistakes a cutoff can't catch."
            >
              Every message Jev saw, with the intent it picked, how sure it was, and its five most likely answers. Filter for
              the mistakes that matter most: wrong answers Jev was confident about.
              <Ref n={4} />
            </Para>
            <Explorer areas={meta.areas} />
          </Section>

          <Section id="pipeline" title="How it's built" space="mt-28">
            <Para className="mt-5">
              Tickets stream through Kafka into ClickHouse, an Airflow DAG asks Jev about each one, and the calibration math
              runs in ClickHouse. Select a numbered part to read the design decision behind it.
            </Para>
            <figure className="mt-10">
              <Schematic steps={steps(meta.models[M13].questions_per_call)} />
              <Caption n={5}>
                The pipeline, from the ticket producer to the report. Arrows show the direction data moves; Airflow and the
                Jev API exchange one request and one response per ticket.
              </Caption>
            </figure>
            <Proof />
          </Section>

          <Section id="typesafe" title="What I'd build at TypeSafe" space="mt-32">
            <Para className="mt-5">
              Every Jev call is an event worth keeping. This project is a small version of that problem. Here is where I
              would take it.
            </Para>
            <Grid className="mt-8">
              <ol className="wide:col-span-8">
                {TYPESAFE.map(([title, body], i) => (
                  <li key={title} className="grid grid-cols-[2rem_1fr] border-t border-hairline py-5 first:border-t-0 first:pt-0">
                    <span className="num pt-0.5 text-sm text-ink-2">{i + 1}</span>
                    <div>
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <p className="prose-text mt-1">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Grid>
          </Section>

          <Section id="about" title="About the author" space="mt-28">
            <Para className="mt-5">
              I&apos;m Jayanth Veeramachaneni, a data engineer with 5+ years of building production data platforms,
              currently a Sr. Data Engineer at Dynatrace. This study is how I would want to judge a model before letting it
              act on its own.
            </Para>
            <Grid className="mt-8">
              <table className="wide:col-span-8">
                <caption className="sr-only">What the role needs, and my evidence for each</caption>
                <thead>
                  <tr className="border-b border-ink text-left text-xs text-ink-2">
                    <th scope="col" className="w-[38%] py-2 pr-6 font-normal">
                      The role needs
                    </th>
                    <th scope="col" className="py-2 font-normal">
                      Evidence
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FIT.map(([need, evidence]) => (
                    <tr key={need} className="border-b border-hairline align-top">
                      <th scope="row" className="py-4 pr-6 text-left text-sm font-semibold">
                        {need}
                      </th>
                      <td className="py-4 font-serif text-[0.9375rem] leading-relaxed">{evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Grid>
            <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <li>
                <a href="mailto:jayanthveeramachaneni79@gmail.com">jayanthveeramachaneni79@gmail.com</a>
              </li>
              <li>
                <a href="https://www.linkedin.com/in/jayanth-veeramachaneni">LinkedIn</a>
              </li>
              <li>
                <a href="https://github.com/Jayu79">GitHub</a>
              </li>
            </ul>
          </Section>
        </main>

        <footer className="mt-28 border-t border-hairline py-8 text-xs text-ink-2">
          <p className="text-ink">Built by Jayanth Veeramachaneni.</p>
          <p className="mt-1">
            Data:{" "}
            <a href={meta.source.url}>
              {meta.source.dataset} ({meta.source.author}, {meta.source.license})
            </a>
            . Jev results from TypeSafe&apos;s API, run {runMonth()}.
          </p>
          <p className="mt-1">
            <a href={REPO}>Source code on GitHub</a>
          </p>
        </footer>
      </div>
    </SiteState>
  );

  function Masthead() {
    const items: [string, React.ReactNode][] = [
      ["Dataset", `${meta.source.dataset}, ${int(nTickets)} tickets`],
      ["Models", MODELS.join(", ")],
      ["Intents", String(nIntents)],
      ["Run", runMonth()],
      ["Author", "Jayanth Veeramachaneni"],
      [
        "Source",
        <a key="src" href={REPO}>
          Jayu79/<wbr />
          jev-decision-pipeline
        </a>,
      ],
    ];
    return (
      // Desktop: title and tag share one line; the metadata sizes its columns to its
      // values (three across from 1240px, two across below) so nothing wraps.
      <header className="border-b border-hairline pt-10 pb-8">
        <div className="flex flex-col gap-8 wide:flex-row wide:items-end wide:justify-between wide:gap-6">
          <div className="wide:min-w-0">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 wide:flex-nowrap">
              <h1 className="display text-2xl whitespace-nowrap">Jev, calibrated</h1>
              <InspectionTag text={`Measured: ${pct(headline.coverage)} at 95% accuracy`} />
            </div>
            <p className="mt-3 max-w-[52ch] font-serif text-lg leading-snug text-ink">
              Can you trust a model&apos;s confidence enough to let it route support tickets on its own?
            </p>
          </div>
          <dl className="grid max-w-[40rem] grid-cols-2 gap-x-6 gap-y-4 text-xs sm:grid-cols-3 wide:max-w-none wide:shrink-0 wide:grid-cols-[repeat(2,auto)] full:grid-cols-[repeat(3,auto)]">
            {items.map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink-2">{k}</dt>
                <dd className="num mt-0.5 text-ink wide:whitespace-nowrap">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
    );
  }

  function Comparison() {
    type Row = {
      label: string;
      values: [number | null, number | null];
      show: (v: number | null) => string;
      sub?: (m: Model) => string | null;
      better: "higher" | "lower" | "calib";
    };
    const cov = (s: Strategy, target: number) => (m: Model) => at(grid[m][s], target);
    const covRow = (s: Strategy, target: number): Row => ({
      label: `Coverage at ${Math.round(target * 100)}% accuracy`,
      values: MODELS.map((m) => (cov(s, target)(m).cutoff === null ? null : cov(s, target)(m).coverage)) as [number | null, number | null],
      show: (v) => (v === null ? "not reachable" : pct(v)),
      sub: (m) => {
        const c = cov(s, target)(m).cutoff;
        return c === null ? null : `cutoff ${cutoff(c)}`;
      },
      better: "higher",
    });
    const strategyRows = (s: Strategy): Row[] => [
      { label: "Accuracy", values: [summary[M13][s].accuracy, summary[M14][s].accuracy], show: (v) => pct(v as number), better: "higher" },
      {
        label: "Mean stated confidence",
        values: [summary[M13][s].mean_stated_confidence, summary[M14][s].mean_stated_confidence],
        show: (v) => pct(v as number),
        better: "calib",
      },
      { label: "ECE", values: [summary[M13][s].ece, summary[M14][s].ece], show: (v) => (v as number).toFixed(3), better: "lower" },
      { label: "Brier score", values: [summary[M13][s].brier, summary[M14][s].brier], show: (v) => (v as number).toFixed(3), better: "lower" },
      covRow(s, 0.9),
      covRow(s, 0.95),
      covRow(s, 0.98),
    ];
    const lat = (k: "p50" | "p95" | "p99"): Row => ({
      label: `Latency ${k}`,
      values: [meta.models[M13].latency_ms[k], meta.models[M14].latency_ms[k]],
      show: (v) => `${Math.round(v as number)} ms`,
      better: "lower",
    });
    const groups: [string, Row[], Strategy | null][] = [
      ["Flat question", strategyRows("flat"), "flat"],
      ["Fan-out", strategyRows("fanout"), "fanout"],
      [
        "Per call, shared by both strategies",
        [
          lat("p50"),
          lat("p95"),
          lat("p99"),
          { label: "Cost", values: [meta.models[M13].cost_usd, meta.models[M14].cost_usd], show: (v) => `$${(v as number).toFixed(2)}`, better: "lower" },
        ],
        null,
      ],
    ];
    const winner = (r: Row, s: Strategy | null): number => {
      const [a, b] = r.values;
      if (a === null && b === null) return -1;
      if (a === null) return 1;
      if (b === null) return 0;
      if (r.show(a) === r.show(b) && (r.sub?.(M13) ?? "") === (r.sub?.(M14) ?? "")) return -1;
      let ka = a;
      let kb = b;
      if (r.better === "calib" && s) {
        // Closer to the model's own accuracy is better.
        ka = -Math.abs(a - summary[M13][s].accuracy);
        kb = -Math.abs(b - summary[M14][s].accuracy);
      } else if (r.better === "lower") {
        ka = -a;
        kb = -b;
      }
      return ka > kb ? 0 : kb > ka ? 1 : -1;
    };

    // The takeaway is written from the numbers, so it can't drift from them.
    const c13 = at(grid[M13].flat, 0.95);
    const c14 = at(grid[M14].flat, 0.95);
    const accGap = (f14.accuracy - f13.accuracy) * 100;
    const calibrated = f14.ece < f13.ece ? "better calibrated" : "not better calibrated";
    const accuracy =
      Math.abs(accGap) < 0.5
        ? `but not more accurate (${pct(f14.accuracy)} vs ${pct(f13.accuracy)})`
        : accGap > 0
          ? `and more accurate (${pct(f14.accuracy)} vs ${pct(f13.accuracy)})`
          : `and less accurate (${pct(f14.accuracy)} vs ${pct(f13.accuracy)})`;
    const covGap = (c14.coverage - c13.coverage) * 100;
    const coverage = `${Math.abs(covGap) < 2 ? "slightly " : ""}${covGap < 0 ? "less" : "more"}`;
    const o95_13 = at(grid[M13].fanout, 0.95);
    const o95_14 = at(grid[M14].fanout, 0.95);
    const same = meta.models[M13].question_version === meta.models[M14].question_version;

    return (
      <>
        <Para
          className="mt-5"
          n={3}
          note={
            same
              ? `Both runs asked the same ${meta.models[M13].questions_per_call} questions per call (question version ${meta.models[M13].question_version}), so only the model differs.`
              : "The two runs used different question versions."
          }
        >
          Same {int(nTickets)} tickets, same questions.
          <Ref n={3} /> On the flat question, {M14} is {calibrated} (ECE {f13.ece.toFixed(3)} to {f14.ece.toFixed(3)}){" "}
          {accuracy}, and it covers {coverage} at 95% accuracy ({pct(c14.coverage)} vs {pct(c13.coverage)}).
          {o95_13.cutoff === null &&
            o95_14.cutoff !== null &&
            ` On fan-out it reaches 95% accuracy where ${M13} never did (${pct(o95_14.coverage)} of tickets), but fan-out is still the weaker strategy.`}
          {covGap <= 0 && " For routing tickets with the flat question, the new version isn't a reason to switch."}
        </Para>
        <Grid className="mt-10">
          <figure className="wide:col-span-8">
            <table className="num w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[46%]" />
                <col />
                <col />
              </colgroup>
              <caption className="sr-only">
                {M13} and {M14} compared. The better value in each row is marked.
              </caption>
              <thead>
                <tr className="border-b border-ink">
                  <th scope="col" className="py-2 text-left text-xs font-normal text-ink-2">
                    Metric
                  </th>
                  {MODELS.map((m) => (
                    <th key={m} scope="col" className="py-2 text-right font-semibold whitespace-nowrap">
                      <svg width="10" height="10" aria-hidden className="mr-1.5 inline-block align-[-1px]">
                        {m === M14 ? <rect x="1" y="1" width="8" height="8" fill="var(--m114)" /> : <circle cx="5" cy="5" r="4" fill="var(--m113)" />}
                      </svg>
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map(([title, rows, s]) => (
                <tbody key={title}>
                  <tr>
                    <th colSpan={3} scope="colgroup" className="pt-7 pb-2 text-left font-semibold">
                      {title}
                    </th>
                  </tr>
                  {rows.map((r) => {
                    const w = winner(r, s);
                    return (
                      <tr key={r.label} className="border-t border-hairline align-top">
                        <th scope="row" className="py-2.5 pr-4 text-left font-normal text-ink-2">
                          {r.label}
                        </th>
                        {MODELS.map((m, i) => (
                          <td key={m} className="py-2.5 text-right">
                            {w === i && (
                              <>
                                <span aria-hidden className="mr-2 inline-block size-1.5 rounded-full bg-ink align-middle" />
                                <span className="sr-only">Better: </span>
                              </>
                            )}
                            {r.show(r.values[i])}{" "}
                            {r.sub?.(m) && <span className="block text-xs text-ink-2">{r.sub(m)}</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
            <Caption n={3}>
              {M13} and {M14} on the same tickets. A dot marks the better value in each row; for mean stated confidence,
              better means closer to that model&apos;s own accuracy. Coverage is the share of tickets Jev can handle alone
              while staying at that accuracy, at the best cutoff on a 0.01 grid; the calibration reports list exact
              cutoffs, which can cover slightly more.
            </Caption>
          </figure>
        </Grid>
      </>
    );
  }

  function Proof() {
    const calls = MODELS.map((m) => meta.models[m]);
    const ok = calls.every((c) => c.calls_ok === calls[0].calls_ok);
    const cost = calls.reduce((a, c) => a + c.cost_usd, 0);
    const ids = MODELS.reduce((a, m) => a + requestIds[m], 0);
    const allCalls = calls.reduce((a, c) => a + c.calls_ok + c.calls_failed, 0);
    const items: [string, string][] = [
      ["Models served", MODELS.join(", ")],
      [
        "Calls",
        ok
          ? `${int(calls[0].calls_ok)} per model, ${int(calls.reduce((a, c) => a + c.calls_failed, 0))} failed`
          : calls.map((c) => `${c.model_served}: ${int(c.calls_ok)} ok, ${int(c.calls_failed)} failed`).join("; "),
      ],
      ["Request IDs captured", `${int(ids)} of ${int(allCalls)}`],
      ["Cost, both runs", `$${cost.toFixed(2)}`],
    ];
    return (
      <div className="mt-14">
        <h3 className="text-sm font-semibold">How you know these are real Jev answers</h3>
        <p className="prose-text mt-1">
          The served model and the <span className="whitespace-nowrap">x-typesafe-request-id</span> header come from TypeSafe&apos;s responses, and token totals can
          be checked against TypeSafe&apos;s usage page.
        </p>
        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 border-y border-hairline py-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-ink-2">{k}</dt>
              <dd className="num mt-0.5 text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 flex flex-col gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-8">
          <li>
            <a href={`${BASE}/reports/calibration_report.html`}>Calibration report for {M13}</a>
          </li>
          <li>
            <a href={`${BASE}/reports/calibration_report_${M14}.html`}>Calibration report for {M14}</a>
          </li>
          <li>
            <a href={`${REPO}/blob/main/evidence/jev_responses_sample.jsonl`}>Raw {M13} responses on GitHub</a>
          </li>
          <li>
            <a href={`${REPO}/blob/main/evidence/${M14}_responses_sample.jsonl`}>Raw {M14} responses on GitHub</a>
          </li>
        </ul>
      </div>
    );
  }
}

function InspectionTag({ text }: { text: string }) {
  // A luggage-style inspection tag: point on the left, a punched hole, the measured result.
  return (
    <span className="num relative inline-flex h-7 shrink-0 items-center pr-3 pl-6 text-xs font-semibold whitespace-nowrap text-ink">
      <span aria-hidden className="absolute inset-0 bg-signal [clip-path:polygon(12px_0,100%_0,100%_100%,12px_100%,0_50%)]" />
      <span aria-hidden className="absolute top-1/2 left-[9px] size-2 -translate-y-1/2 rounded-full border border-ink bg-paper" />
      <span className="relative">{text}</span>
    </span>
  );
}

function steps(questionsPerCall: number): Step[] {
  return [
    {
      name: "Producer",
      detail: ["Banking77 messages", "as events"],
      decision: "Labels never travel with the tickets",
      why: "The producer streams only the message text. Correct intents load into ClickHouse from a separate source, the way real outcomes arrive after a decision, so nothing downstream can see the answer early.",
    },
    {
      name: "Kafka (Redpanda)",
      detail: ["support_tickets topic", "at-least-once", "delivery"],
      decision: "Built for at-least-once delivery",
      why: "Kafka can deliver a message more than once. Every table downstream is keyed on the ticket's event ID, so a replay or duplicate collapses instead of being counted twice.",
    },
    {
      name: "ClickHouse",
      detail: ["Kafka engine table", "+ materialized view"],
      decision: "ClickHouse pulls from Kafka itself, and duplicates collapse on merge",
      why: "A Kafka engine table and a materialized view land tickets in a ReplacingMergeTree keyed on event_id, and every analytical read uses FINAL. There is no consumer service to run; ingestion is declarative SQL.",
    },
    {
      name: "Airflow DAG",
      detail: ["decide, check, report", "max_active_runs=1"],
      decision: "No retry on the decide task, and one run at a time",
      why: "Runs are resumable: they only decide tickets that have no successful call yet. A task retry would only re-bill calls, and max_active_runs=1 keeps two runs from deciding the same tickets.",
    },
    {
      name: "Jev API",
      detail: [`${questionsPerCall} Choice questions`, "per call"],
      decision: "Every answer stores a question_version hash",
      why: "The hash covers every question and intent description in questions.py. Change one word and old and new results never mix, and a rerun decides only what is missing.",
    },
    {
      name: "ClickHouse tables",
      detail: ["jev_calls", "jev_answers", "strategy_decisions"],
      decision: "One jev_calls row per request",
      why: "Latency, tokens, retries, the served model and the request ID are stored for every call, so cost and reliability are queryable and reconcile with TypeSafe's usage page.",
    },
    {
      name: "Report",
      detail: ["calibration, coverage,", "provenance"],
      decision: "Quality checks gate the report, and calibration runs in ClickHouse",
      why: "If probabilities don't sum to 1 (within 0.02, since Jev rounds), or any ticket is undecided or unlabelled, the run fails instead of publishing. Coverage uses a RANGE window so tied confidences count whole: each point is exactly every ticket at or above that confidence.",
    },
  ];
}

const TYPESAFE: [string, string][] = [
  [
    "One usage-event schema at the API edge",
    "Org, key, model version, question types and counts, tokens, latency, status and request ID for every call, emitted to Kafka and landed in ClickHouse the way tickets are here.",
  ],
  [
    "Billing and analytics from the same table",
    "Materialized views roll events into per-org hourly usage. With one source of truth, billing and dashboards can't disagree.",
  ],
  [
    "Permissions in the warehouse, not the BI tool",
    "ClickHouse row policies scoped by org for anything customer-facing, and role-based grants for internal teams.",
  ],
  [
    "A model-quality loop",
    "Join customers' downstream outcomes, where they share them, back to decisions the way decision_eval does here. That gives calibration per model version in production, not just on benchmarks.",
  ],
  [
    "Contracts on the event stream",
    "A schema registry plus checks like the ones in this pipeline, so a bad deploy shows up as a failed check instead of a wrong invoice.",
  ],
];

const FIT: [string, string][] = [
  [
    "Pipelines, infrastructure and internal tools",
    "At Dynatrace, a framework moving data from 10+ sources on AWS into Snowflake with Kafka, Kubernetes (EKS) and Python, with infrastructure as code in Terraform. At Block, internal Python frameworks that generate and distribute regulatory reports.",
  ],
  [
    "Transformations, analytical models and BI",
    "dbt models on Snowflake for downstream consumers, Power BI telemetry dashboards used by leadership, and standardized compliance metrics at Block.",
  ],
  ["Data access and permissioning", "Snowflake role-based access control at Dynatrace, and for regulatory and compliance data at Block."],
  ["Reliability and data quality", "Audit-ready regulatory pipelines on Airflow at Block, and the quality gates and provenance in this project."],
  ["Kafka, ClickHouse and an orchestrator", "Kafka at Dynatrace, and Kafka, ClickHouse and Airflow end to end in this project."],
  [
    "Practical AI",
    "An MCP server connecting compliance data to Goose, Block's open-source AI agent, built with early MCP access through Block's partnership with Anthropic. The UT Austin (McCombs) Post Graduate Program in AI & Machine Learning. And this calibration study.",
  ],
];
