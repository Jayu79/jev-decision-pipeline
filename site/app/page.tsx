import type { Metadata } from "next";
import { Explorer } from "@/components/Explorer";
import { Hero } from "@/components/Hero";
import { N } from "@/components/N";
import { Pipeline, type Step } from "@/components/Pipeline";
import { Reliability } from "@/components/Reliability";
import { SiteState } from "@/components/SiteState";
import { getDecisions, getHero, getMeta, getSummary, getTicketCount } from "@/lib/data";
import { cutoff, int, pct } from "@/lib/format";
import { DEFAULT, readout } from "@/lib/metrics";
import { MODELS, STRATEGIES, STRATEGY_LABEL, type CoverageAt, type Model, type ReliabilityBin, type Strategy } from "@/lib/types";

const REPO = "https://github.com/Jayu79/jev-decision-pipeline";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const summary = getSummary();
const meta = getMeta();
const nTickets = getTicketCount();
const nIntents = meta.areas.reduce((n, a) => n + a.intents.length, 0);
const [M13, M14] = MODELS;

export function generateMetadata(): Metadata {
  return {
    description: `${int(nTickets)} banking support tickets classified by TypeSafe's Jev into ${nIntents} intents, measured for calibration on ${M13} and ${M14}. A project by Jayanth Veeramachaneni.`,
  };
}

const byModel = <T,>(f: (m: Model, s: Strategy) => T) =>
  Object.fromEntries(MODELS.map((m) => [m, Object.fromEntries(STRATEGIES.map((s) => [s, f(m, s)]))])) as Record<
    Model,
    Record<Strategy, T>
  >;

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

const at = (c: CoverageAt[], target: number) => c.find((x) => Math.abs(x.target - target) < 1e-9) as CoverageAt;

/** Count of calls with a TypeSafe request ID, per model (both strategies share one call). */
const requestIds = Object.fromEntries(
  MODELS.map((m) => [m, new Set(getDecisions(m, "flat").rows.map((r) => r[5]).filter(Boolean)).size]),
) as Record<Model, number>;

function Section({ id, title, wide, children }: { id: string; title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-28 scroll-mt-6 sm:mt-40">
      <h2 id={`${id}-title`} className="max-w-[680px] text-xl sm:text-2xl">
        {title}
      </h2>
      <div className={`mt-6 ${wide ? "" : "max-w-[680px]"}`}>{children}</div>
    </section>
  );
}

export default function Page() {
  const coverageAt = byModel((m, s) => summary[m][s].coverage_at);
  const bins = byModel((m, s) => summary[m][s].reliability);
  const initial = readout(getHero()[DEFAULT.model][DEFAULT.strategy], DEFAULT.cut);

  const f13 = summary[M13].flat;
  const f14 = summary[M14].flat;
  const o13 = summary[M13].fanout;
  const o14 = summary[M14].fanout;
  const hi = above(f13.reliability, 0.8);
  const gapPts = Math.round((hi.stated - hi.right) * 100);

  return (
    <SiteState>
      <main className="mx-auto max-w-[1100px] px-4 pb-24 sm:px-6">
        <Hero nTickets={nTickets} nIntents={nIntents} coverageAt={coverageAt} initial={initial} />

        <Section id="calibration" title="Is Jev's confidence honest?" wide>
          <div className="max-w-[680px]">
            <p>
              Each point groups tickets by the probability Jev gave its own pick. If Jev were calibrated, the points
              would sit on the dashed line: when it says 90%, it would be right 90% of the time.
            </p>
            <p className="mt-4">
              It isn&apos;t, quite. On the flat question, <N>{M13}</N> is about <N>{gapPts}</N> points overconfident above 0.8: it
              stated <N>{pct(hi.stated)}</N> on average and was right <N>{pct(hi.right)}</N> of the time, across <N>{int(hi.n)}</N> tickets.
              Expected calibration error (ECE), the average gap, is <N>{f13.ece.toFixed(3)}</N> for <N>{M13}</N> and{" "}
              <N>{f14.ece.toFixed(3)}</N> for <N>{M14}</N> on the flat question, and <N>{o13.ece.toFixed(3)}</N> and <N>{o14.ece.toFixed(3)}</N> on
              fan-out. Confidence still ranks answers well, which is why a measured cutoff works.
            </p>
          </div>
          <div className="mt-10">
            <Reliability bins={bins} />
          </div>
        </Section>

        <Section id="compare" title="1.13 vs 1.14" wide>
          <Comparison />
        </Section>

        <Section id="explorer" title="Read the tickets" wide>
          <p className="mb-8 max-w-[680px]">
            Every message Jev saw, with the intent it picked, how sure it was, and its five most likely answers. Filter
            for the mistakes that matter most: wrong answers Jev was confident about.
          </p>
          <Explorer areas={meta.areas} />
        </Section>

        <Section id="pipeline" title="How it's built" wide>
          <p className="mb-8 max-w-[680px]">
            Tickets stream through Kafka into ClickHouse, an Airflow DAG asks Jev about each one, and the calibration
            math runs in ClickHouse. Pick a step to see the design decision behind it.
          </p>
          <Pipeline steps={steps(meta.models[M13].questions_per_call)} />
          <Proof />
        </Section>

        <Section id="typesafe" title="What I'd build at TypeSafe">
          <p>Every Jev call is an event worth keeping. This project is a small version of that problem. Here is where I would take it.</p>
          <ol className="mt-6 flex flex-col gap-5">
            {TYPESAFE.map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[2rem_1fr]">
                <span className="font-semibold text-steel"><N>{`${i + 1}.`}</N></span>
                <div>
                  <h3 className="text-base">{title}</h3>
                  <p className="mt-1 text-steel">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="about" title="About me">
          <p>
            I&apos;m Jayanth Veeramachaneni, a data engineer with <N>5</N>+ years of building production data platforms. I&apos;m
            currently a Sr. Data Engineer at Dynatrace.
          </p>
          <dl className="mt-8 border-t border-rule">
            {FIT.map(([need, evidence]) => (
              <div key={need} className="grid gap-1 border-b border-rule py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
                <dt className="font-semibold">{need}</dt>
                <dd className="text-steel">{evidence}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
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

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-1 px-4 py-10 text-sm text-steel sm:px-6">
          <p className="text-ink">Built by Jayanth Veeramachaneni.</p>
          <p>
            Data:{" "}
            <a href={meta.source.url}>
              {meta.source.dataset} ({meta.source.author}, {meta.source.license})
            </a>
            . Jev results from TypeSafe&apos;s API, run <N>{runMonth()}</N>.
          </p>
          <p>
            <a href={REPO}>Source code on GitHub</a>
          </p>
        </div>
      </footer>
    </SiteState>
  );

  function Comparison() {
    type Row = {
      label: string;
      values: [number | null, number | null];
      show: (v: number | null, m: Model) => string;
      sub?: (m: Model) => string | null;
      better: "higher" | "lower" | "calib" | null;
    };
    const cov = (s: Strategy, target: number) => (m: Model) => at(summary[m][s].coverage_at, target);
    const covRow = (s: Strategy, target: number): Row => ({
      label: `Coverage at ${Math.round(target * 100)}% accuracy`,
      values: [cov(s, target)(M13).cutoff === null ? null : cov(s, target)(M13).coverage, cov(s, target)(M14).cutoff === null ? null : cov(s, target)(M14).coverage],
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
      [STRATEGY_LABEL.flat, strategyRows("flat"), "flat"],
      [STRATEGY_LABEL.fanout, strategyRows("fanout"), "fanout"],
      [
        "Per call (both strategies are answered in the same call)",
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
      if (r.show(a, M13) === r.show(b, M14) && (r.sub?.(M13) ?? "") === (r.sub?.(M14) ?? "")) return -1;
      return ka > kb ? 0 : kb > ka ? 1 : -1;
    };

    // The takeaway is written from the numbers, so it can't drift from them.
    const c13 = at(f13.coverage_at, 0.95);
    const c14 = at(f14.coverage_at, 0.95);
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
    const o95_13 = at(o13.coverage_at, 0.95);
    const o95_14 = at(o14.coverage_at, 0.95);

    return (
      <div>
        <p className="max-w-[680px]">
          Same <N>{int(nTickets)}</N> tickets, same questions, same price. On the flat question, <N>{M14}</N> is <N>{calibrated}</N> (ECE{" "}
          <N>{f13.ece.toFixed(3)}</N> to <N>{f14.ece.toFixed(3)}</N>) <N>{accuracy}</N>, and it covers <N>{coverage}</N> at 95% accuracy (
          <N>{pct(c14.coverage)}</N> vs <N>{pct(c13.coverage)}</N>).
          <N>{o95_13.cutoff === null && o95_14.cutoff !== null &&
            ` On fan-out it reaches 95% accuracy where ${M13} never did (${pct(o95_14.coverage)} of tickets), but fan-out is still the weaker strategy.`}</N>
          <N>{covGap <= 0 && " For routing tickets with the flat question, the new version isn't a reason to switch."}</N>
        </p>
        <div className="mt-8">
          <table className="w-full table-fixed text-left">
            <colgroup>
              <col className="w-[38%] sm:w-[34%]" />
              <col />
              <col />
            </colgroup>
            <caption className="sr-only">
              {M13} and {M14} compared. The better value in each row is in bold.
            </caption>
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="py-3 pr-4 font-medium text-steel">
                  Metric
                </th>
                {MODELS.map((m) => (
                  <th key={m} scope="col" className="py-3 pr-4 font-semibold whitespace-nowrap">
                    <N>{m}</N>
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map(([title, rows, s]) => (
              <tbody key={title}>
                <tr>
                  <th colSpan={3} scope="colgroup" className="pt-6 pb-2 text-left font-semibold">
                    {title}
                  </th>
                </tr>
                {rows.map((r) => {
                  const w = winner(r, s);
                  return (
                    <tr key={r.label} className="border-b border-rule">
                      <th scope="row" className="py-2.5 pr-4 font-normal text-steel">
                        {r.label}
                      </th>
                      {MODELS.map((m, i) => (
                        <td key={m} className={`py-2.5 pr-4 ${w === i ? "font-semibold" : ""}`}>
                          <N>{r.show(r.values[i], m)}</N>{" "}
                          {r.sub?.(m) && (
                            <span className="block text-sm font-normal text-steel">
                              <N>{r.sub(m) as string}</N>
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
        <p className="mt-4 max-w-[680px] text-sm text-steel">
          Bold marks the better value in each row. For mean stated confidence, better means closer to the model&apos;s
          own accuracy. Coverage is the share of tickets Jev can handle alone while staying at that accuracy.
        </p>
      </div>
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
      ["Request IDs captured", `${int(ids)} of ${int(allCalls)} calls`],
      ["Total cost, both runs", `$${cost.toFixed(2)}`],
    ];
    return (
      <div className="mt-12">
        <h3 className="text-lg">How you know these are real Jev answers</h3>
        <p className="mt-2 max-w-[680px] text-steel">
          The model version and the x-typesafe-request-id header come from TypeSafe&apos;s responses, and token
          totals can be checked against TypeSafe&apos;s usage page.
        </p>
        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 border-y border-rule py-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-steel">{k}</dt>
              <dd className="mt-1 text-lg font-semibold"><N>{v}</N></dd>
            </div>
          ))}
        </dl>
        <ul className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-8">
          <li>
            <a href={`${BASE}/reports/calibration_report.html`}><N>Calibration report for {M13}</N></a>
          </li>
          <li>
            <a href={`${BASE}/reports/calibration_report_${M14}.html`}><N>Calibration report for {M14}</N></a>
          </li>
          <li>
            <a href={`${REPO}/blob/main/evidence/jev_responses_sample.jsonl`}><N>Raw {M13} responses on GitHub</N></a>
          </li>
          <li>
            <a href={`${REPO}/blob/main/evidence/${M14}_responses_sample.jsonl`}><N>Raw {M14} responses on GitHub</N></a>
          </li>
        </ul>
      </div>
    );
  }
}

function runMonth() {
  const d = new Date(`${meta.models[MODELS[0]].first_call_utc.replace(" ", "T")}Z`);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function steps(questionsPerCall: number): Step[] {
  return [
    {
      name: "Producer",
      detail: "Banking77 messages as events",
      decision: "Labels never travel with the tickets",
      why: "The producer streams only the message text. Correct intents load into ClickHouse from a separate source, the way real outcomes arrive after a decision, so nothing downstream can see the answer early.",
    },
    {
      name: "Kafka (Redpanda)",
      detail: "support_tickets topic",
      decision: "Built for at-least-once delivery",
      why: "Kafka can deliver a message more than once. Every table downstream is keyed on the ticket's event ID, so a replay or duplicate collapses instead of being counted twice.",
    },
    {
      name: "ClickHouse",
      detail: "Kafka engine + materialized view",
      decision: "ClickHouse pulls from Kafka itself, and duplicates collapse on merge",
      why: "A Kafka engine table and a materialized view land tickets in a ReplacingMergeTree keyed on event_id, and every analytical read uses FINAL. There is no consumer service to run; ingestion is declarative SQL.",
    },
    {
      name: "Airflow DAG",
      detail: "Decide, check, report",
      decision: "No retry on the decide task, and one run at a time",
      why: "Runs are resumable: they only decide tickets that have no successful call yet. A task retry would only re-bill calls, and max_active_runs=1 keeps two runs from deciding the same tickets.",
    },
    {
      name: "Jev API",
      detail: `${questionsPerCall} Choice questions per call`,
      decision: "Every answer stores a question_version hash",
      why: "The hash covers every question and intent description in questions.py. Change one word and old and new results never mix, and a rerun decides only what is missing.",
    },
    {
      name: "ClickHouse tables",
      detail: "jev_calls, jev_answers, strategy_decisions",
      decision: "One jev_calls row per request",
      why: "Latency, tokens, retries, the served model and the request ID are stored for every call, so cost and reliability are queryable and reconcile with TypeSafe's usage page.",
    },
    {
      name: "Report",
      detail: "Calibration, coverage, provenance",
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
  [
    "Data access and permissioning",
    "Snowflake role-based access control at Dynatrace, and for regulatory and compliance data at Block.",
  ],
  ["Reliability and data quality", "Audit-ready regulatory pipelines on Airflow at Block, and the quality gates and provenance in this project."],
  ["Kafka, ClickHouse and an orchestrator", "Kafka at Dynatrace, and Kafka, ClickHouse and Airflow end to end in this project."],
  [
    "Practical AI",
    "An MCP server connecting compliance data to Goose, Block's open-source AI agent, built with early MCP access through Block's partnership with Anthropic. The UT Austin (McCombs) Post Graduate Program in AI & Machine Learning. And this calibration study.",
  ],
];
