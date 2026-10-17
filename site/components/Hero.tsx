"use client";

import { useEffect, useMemo, useState } from "react";
import { DotGrid } from "./DotGrid";
import { N } from "./N";
import { ModelLabel, Segmented } from "./Segmented";
import { useSiteState } from "./SiteState";
import { cutoff as fmtCutoff, int, pct } from "@/lib/format";
import { DEFAULT, readout, type Readout } from "@/lib/metrics";
import { MODELS, STRATEGIES, STRATEGY_LABEL, type CoverageAt, type Hero as HeroData, type Model, type Strategy } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function scrollToExplorer() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("explorer")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function Hero({
  nTickets,
  nIntents,
  coverageAt,
  initial,
}: {
  nTickets: number;
  nIntents: number;
  coverageAt: Record<Model, Record<Strategy, CoverageAt[]>>;
  /** Readout for the default state, computed at build time so the page opens with numbers. */
  initial: Readout;
}) {
  const [data, setData] = useState<HeroData | null>(null);
  const [model, setModel] = useState<Model>(DEFAULT.model);
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT.strategy);
  const [cut, setCut] = useState(DEFAULT.cut);
  const { openTicket } = useSiteState();

  useEffect(() => {
    let live = true;
    fetch(`${BASE}/data/hero.json`)
      .then((r) => r.json())
      .then((d: HeroData) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);

  const series = data?.[model][strategy];
  const isDefault = model === DEFAULT.model && strategy === DEFAULT.strategy && cut === DEFAULT.cut;
  const r = useMemo(() => (series ? readout(series, cut) : isDefault ? initial : null), [series, cut, isDefault, initial]);
  const presets = coverageAt[model][strategy];

  const valueText = r
    ? `Cutoff ${fmtCutoff(cut)}. Jev handles ${int(r.handled)} tickets (${pct(r.handled / r.n)}), ` +
      `${r.handled ? pct(r.correct / r.handled) : "no"} accurate; ${int(r.mistakes)} mistakes would ship; ` +
      `${int(r.toPerson)} sent to a person.`
    : `Cutoff ${fmtCutoff(cut)}`;
  const slider = Math.min(100, Math.max(50, Math.round(cut * 100)));

  const tableCuts = Array.from({ length: 11 }, (_, i) => Math.round((50 + i * 5)) / 100);

  return (
    <section aria-labelledby="hero-title" className="pt-16 sm:pt-24">
      <div className="max-w-[680px]">
        <h1 id="hero-title" className="text-2xl sm:text-3xl">
          Can you trust Jev&apos;s confidence enough to let it route support tickets on its own?
        </h1>
        <p className="mt-6 text-lg text-steel">
          I streamed <N>{int(nTickets)}</N> real banking support messages through Kafka and ClickHouse and asked
          TypeSafe&apos;s Jev to sort each into one of <N>{nIntents}</N> intents. Drag the cutoff to choose which tickets
          Jev handles alone.
        </p>
      </div>

      <div className="mt-12 rounded-2xl border border-rule bg-surface p-4 sm:p-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:gap-x-10">
          <Segmented
            label="Model"
            value={model}
            onChange={setModel}
            options={MODELS.map((m) => ({ value: m, label: <ModelLabel model={m} /> }))}
          />
          <Segmented
            label="Questions"
            value={strategy}
            onChange={setStrategy}
            options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))}
          />
        </div>

        <div className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <label htmlFor="cutoff" className="text-lg font-medium">
              Confidence cutoff <span className="text-2xl font-semibold"><N>{fmtCutoff(cut)}</N></span>
            </label>
            <span className="text-sm text-steel">Jev handles every ticket at or above it</span>
          </div>
          <input
            id="cutoff"
            className="cutoff mt-2"
            type="range"
            min={50}
            max={100}
            step={1}
            value={slider}
            aria-valuetext={valueText}
            style={{ ["--fill" as string]: `${((slider - 50) / 50) * 100}%` }}
            onChange={(e) => setCut(Number(e.target.value) / 100)}
          />
          <div className="flex justify-between text-sm text-steel" aria-hidden>
            <N>0.50</N>
            <N>1.00</N>
          </div>
          <div role="group" aria-label="Set the cutoff for an accuracy target" className="mt-4 flex flex-wrap gap-2">
            {presets.map((p) => {
              const label = `${Math.round(p.target * 100)}% accuracy`;
              if (p.cutoff === null)
                return (
                  <button key={p.target} type="button" disabled className="min-h-10 rounded-full border border-dashed border-rule px-4 text-sm text-steel">
                    <N>{label}: not reachable</N>
                  </button>
                );
              const on = Math.abs(cut - p.cutoff) < 1e-9;
              return (
                <button
                  key={p.target}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCut(p.cutoff as number)}
                  className={`min-h-10 rounded-full border px-4 text-sm font-medium ${
                    on ? "border-ink bg-ink text-paper" : "border-rule bg-paper hover:border-steel"
                  }`}
                >
                  <N>{label}</N>
                </button>
              );
            })}
          </div>
        </div>

        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          <Stat label="Handled by Jev" value={r ? pct(r.handled / r.n) : "…"} sub={r ? `${int(r.handled)} tickets` : ""} />
          <Stat
            label="Accuracy on those"
            value={r ? (r.handled ? pct(r.correct / r.handled) : "none") : "…"}
            sub={r ? `${int(r.correct)} right` : ""}
          />
          <Stat label="Mistakes that would ship" value={r ? int(r.mistakes) : "…"} sub="wrong and sent anyway" />
          <Stat label="Sent to a person" value={r ? int(r.toPerson) : "…"} sub={r ? pct(r.toPerson / r.n) : ""} />
        </dl>

        <div className="mt-10">
          {series ? (
            <DotGrid
              series={series}
              handled={r?.handled ?? 0}
              onPick={(i) => {
                openTicket(model, strategy, series.ticket[i]);
                scrollToExplorer();
              }}
            />
          ) : (
            <div className="aspect-[77/40] w-full rounded-lg bg-paper" aria-hidden />
          )}
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-steel">
            <li className="flex items-center gap-2">
              <span aria-hidden className="inline-block size-3 rounded-full bg-correct" />
              Right
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="inline-block size-3 rounded-full border-2 border-wrong" />
              Wrong
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="inline-block size-3 rounded-full bg-correct opacity-25" />
              Faded: below the cutoff, sent to a person
            </li>
            <li>Click a dot to read that ticket.</li>
          </ul>
        </div>

        {series && (
          <details className="mt-6 text-sm">
            <summary>Show these numbers as a table</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <caption className="sr-only">
                  {model}, {STRATEGY_LABEL[strategy]}: what each cutoff hands to Jev
                </caption>
                <thead className="text-steel">
                  <tr className="border-b border-rule">
                    <th className="py-2 pr-4 font-medium">Cutoff</th>
                    <th className="py-2 pr-4 font-medium">Handled by Jev</th>
                    <th className="py-2 pr-4 font-medium">Accuracy on those</th>
                    <th className="py-2 pr-4 font-medium">Mistakes that would ship</th>
                    <th className="py-2 font-medium">Sent to a person</th>
                  </tr>
                </thead>
                <tbody>
                  {tableCuts.map((c) => {
                    const t = readout(series, c);
                    return (
                      <tr key={c} className="border-b border-rule last:border-0">
                        <td className="py-2 pr-4"><N>{fmtCutoff(c)}</N></td>
                        <td className="py-2 pr-4"><N>
                          {int(t.handled)} ({pct(t.handled / t.n)})
                        </N></td>
                        <td className="py-2 pr-4"><N>{t.handled ? pct(t.correct / t.handled) : "none"}</N></td>
                        <td className="py-2 pr-4"><N>{int(t.mistakes)}</N></td>
                        <td className="py-2"><N>{int(t.toPerson)}</N></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="text-sm text-steel">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl"><N>{value}</N></dd>
      <dd className="mt-1 text-sm text-steel"><N>{sub}</N></dd>
    </div>
  );
}
