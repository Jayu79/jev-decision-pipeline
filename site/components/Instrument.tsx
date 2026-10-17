"use client";

import { useEffect, useMemo, useState } from "react";
import { DotGrid } from "./DotGrid";
import { Caption, Note, Ref } from "./Layout";
import { Ruler } from "./Ruler";
import { useSiteState } from "./SiteState";
import { TextToggle } from "./TextToggle";
import { cutoff as fmtCutoff, int, pct } from "@/lib/format";
import { DEFAULT, readout, type Readout } from "@/lib/metrics";
import { MODELS, STRATEGIES, STRATEGY_LABEL, type CoverageAt, type Hero as HeroData, type Model, type Strategy } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function scrollToExplorer() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("explorer")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/** Fig. 1: every ticket, a cutoff ruler, and dials reading out what that cutoff buys. */
export function Instrument({
  nIntents,
  coverageAt,
  initial,
  initialBits,
}: {
  nIntents: number;
  coverageAt: Record<Model, Record<Strategy, CoverageAt[]>>;
  /** Readout for the default state, computed at build time so the page opens with numbers. */
  initial: Readout;
  /** The default view's right/wrong flags in sorted order ("1" right, "0" wrong), so the grid can draw before hero.json arrives. */
  initialBits: string;
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
  const defaultBits = useMemo(() => Uint8Array.from(initialBits, (c) => (c === "1" ? 1 : 0)), [initialBits]);
  const isDefault = model === DEFAULT.model && strategy === DEFAULT.strategy && cut === DEFAULT.cut;
  const r = useMemo(() => (series ? readout(series, cut) : isDefault ? initial : null), [series, cut, isDefault, initial]);

  const valueText = r
    ? `Cutoff ${fmtCutoff(cut)}. Jev handles ${int(r.handled)} tickets (${pct(r.handled / r.n)}), ` +
      `${r.handled ? pct(r.correct / r.handled) : "none"} accurate; ${int(r.mistakes)} mistakes shipped; ` +
      `${int(r.toPerson)} sent to a person.`
    : `Cutoff ${fmtCutoff(cut)}`;
  const tableCuts = Array.from({ length: 11 }, (_, i) => (50 + i * 5) / 100);

  const dials: [string, string, string][] = r
    ? [
        [pct(r.handled / r.n), "handled by Jev", `${int(r.handled)} tickets`],
        [r.handled ? pct(r.correct / r.handled) : "none", "accurate", `${int(r.correct)} right`],
        [int(r.mistakes), "mistakes shipped", "wrong, and sent anyway"],
        [int(r.toPerson), "sent to a person", pct(r.toPerson / r.n)],
      ]
    : [];

  return (
    <figure className="mt-10 flex flex-col gap-8 wide:grid wide:grid-cols-12 wide:gap-x-6 wide:gap-y-0">
      <div className="order-1 flex flex-col gap-y-1 sm:flex-row sm:flex-wrap sm:gap-x-10 wide:col-span-9 wide:col-start-1 wide:row-start-1">
        <TextToggle label="Model" value={model} onChange={setModel} options={MODELS.map((m) => ({ value: m, label: m }))} />
        <TextToggle
          label="Questions"
          value={strategy}
          onChange={setStrategy}
          options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))}
        />
      </div>

      {/* Dials and their note: in the margin on wide screens; elsewhere the dials sit above the field. */}
      <div className="contents wide:col-span-3 wide:col-start-10 wide:row-start-2 wide:mt-6 wide:flex wide:flex-col">
      <dl
        aria-label="Readouts at this cutoff"
        className="order-2 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4 wide:grid-cols-1 wide:gap-y-0"
      >
        {(dials.length ? dials : [["…", "handled by Jev", ""], ["…", "accurate", ""], ["…", "mistakes shipped", ""], ["…", "sent to a person", ""]]).map(
          ([value, label, sub]) => (
            <div key={label} className="flex flex-col border-t border-ink pt-2 wide:pb-5">
              <dt className="order-2 mt-1 text-sm text-ink">{label}</dt>
              <dd className="num order-1 text-2xl font-medium tracking-tight wide:text-3xl">{value}</dd>
              <dd className="num order-3 text-xs text-ink-2">{sub}</dd>
            </div>
          ),
        )}
      </dl>
      <Note n={1} className="order-4 wide:mt-4">
        Coverage counts every ticket at or above the cutoff. Tickets with the same confidence are counted together, never
        split, so each number is what a router applying that cutoff would see.
      </Note>
      </div>

      <div className="order-3 wide:col-span-9 wide:col-start-1 wide:row-start-2 wide:mt-6">
        <DotGrid
          correct={series ? series.correct : defaultBits}
          confidence={series?.confidence}
          cols={nIntents}
          handled={r?.handled ?? 0}
          onPick={
            series
              ? (i) => {
                  openTicket(model, strategy, series.ticket[i]);
                  scrollToExplorer();
                }
              : undefined
          }
        />
        {/* The ruler is its own scale, not the grid's x-axis: separate line, own label. */}
        <div className="mt-8">
          <p id="cutoff-label" className="text-sm font-medium">
            Confidence cutoff
          </p>
          <div className="mt-2">
            <Ruler value={cut} onChange={setCut} marks={coverageAt[model][strategy]} valueText={valueText} labelledBy="cutoff-label" />
          </div>
        </div>
        <Caption n={1}>
          All {int(initial.n)} tickets, highest confidence first, {nIntents} to a row. Filled dots were answered
          correctly; rings were wrong. Dots below the cutoff fade: those tickets go to a person, and the yellow mark at
          the left edge shows the row where the cutoff falls.
          <Ref n={1} /> Drag the ruler or use the
          arrow keys; the marks under it snap to the measured cutoff for each accuracy target.{" "}
          <span className="[@media(hover:none)]:hidden">Click a dot to read its ticket.</span>
          <span className="hidden [@media(hover:none)]:inline">Tap the grid to read a ticket.</span>
        </Caption>
        {series && (
          <details className="no-print mt-4 text-xs">
            <summary>Show these numbers as a table</summary>
            <div className="mt-3 overflow-x-auto">
            <table className="num w-full max-w-[640px] text-left">
              <caption className="sr-only">
                {model}, {STRATEGY_LABEL[strategy]}: what each cutoff hands to Jev
              </caption>
              <thead className="text-ink-2">
                <tr className="border-b border-ink">
                  <th className="py-1.5 pr-3 font-normal">Cutoff</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Handled by Jev</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Accurate</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Mistakes shipped</th>
                  <th className="py-1.5 text-right font-normal">Sent to a person</th>
                </tr>
              </thead>
              <tbody>
                {tableCuts.map((c) => {
                  const t = readout(series, c);
                  return (
                    <tr key={c} className="border-b border-hairline">
                      <td className="py-1.5 pr-3">{fmtCutoff(c)}</td>
                      <td className="py-1.5 pr-3 text-right">
                        {int(t.handled)} ({pct(t.handled / t.n)})
                      </td>
                      <td className="py-1.5 pr-3 text-right">{t.handled ? pct(t.correct / t.handled) : "none"}</td>
                      <td className="py-1.5 pr-3 text-right">{int(t.mistakes)}</td>
                      <td className="py-1.5 text-right">{int(t.toPerson)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </details>
        )}
      </div>
    </figure>
  );
}
