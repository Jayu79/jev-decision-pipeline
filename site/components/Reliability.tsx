"use client";

import { useEffect, useRef, useState } from "react";
import { TextToggle } from "./TextToggle";
import { int, pct } from "@/lib/format";
import { MODELS, STRATEGIES, STRATEGY_LABEL, type Model, type ReliabilityBin, type Strategy } from "@/lib/types";

const COLOR: Record<Model, string> = { "jev-1.13.0": "var(--m113)", "jev-1.14.0": "var(--m114)" };
const MAX_MARK = 14; // px, largest marker
const MIN_MARK = 5;

type Tip = { model: Model; b: ReliabilityBin };

/**
 * Fig. 2. A square reliability diagram on graph paper. Drawn at its real pixel
 * size (not scaled), so text stays legible on phones.
 */
export function Reliability({ bins }: { bins: Record<Model, Record<Strategy, ReliabilityBin[]>> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [strategy, setStrategy] = useState<Strategy>("flat");
  const [tip, setTip] = useState<Tip | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = width <= 480;
  const M = { l: 60, r: narrow ? 78 : 88, t: 10, b: 50 };
  const plot = Math.max(120, width - M.l - M.r);
  const H = plot + M.t + M.b;
  const x = (v: number) => M.l + v * plot;
  const y = (v: number) => M.t + (1 - v) * plot;
  const ticks = narrow ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.2, 0.4, 0.6, 0.8, 1];
  const font = narrow ? 12 : 13;

  const maxN = Math.max(...MODELS.flatMap((m) => bins[m][strategy].map((b) => b.n)));
  const size = (n: number) => MIN_MARK + (MAX_MARK - MIN_MARK) * Math.sqrt(n / maxN);
  const tipText = (t: Tip) => `${t.model}: said ${pct(t.b.mean_p, 0)}, right ${pct(t.b.accuracy, 0)}, ${int(t.b.n)} tickets`;

  // Larger markers first, so smaller ones stay visible on top.
  const marks = MODELS.flatMap((m) => bins[m][strategy].map((b) => ({ m, b, s: size(b.n) }))).sort((a, b) => b.s - a.s);

  // Direct labels at each line's end, nudged apart so they never overlap.
  const ends = MODELS.map((m) => {
    const bs = bins[m][strategy];
    const last = bs[bs.length - 1];
    return { m, y: y(last.accuracy) };
  }).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + font + 6);

  const minor = Array.from({ length: 51 }, (_, i) => i / 50);

  return (
    <div>
      <TextToggle
        label="Questions"
        value={strategy}
        onChange={(s) => {
          setStrategy(s);
          setTip(null);
        }}
        options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))}
      />
      <div ref={wrap} className="relative mt-5 w-full max-w-[600px]">
        <svg width={width} height={H} role="group" aria-label={`Reliability diagram, ${STRATEGY_LABEL[strategy]}`} className="block overflow-visible">
          {/* Graph paper, inside the plot only: a fine line every 0.02, a heavier one every 0.1. */}
          <g aria-hidden>
            {minor.map((v, i) => {
              const major = i % 5 === 0;
              return (
                <g key={v}>
                  <line x1={x(v)} x2={x(v)} y1={y(0)} y2={y(1)} stroke="var(--grid)" strokeWidth={major ? 1 : 0.5} />
                  <line x1={x(0)} x2={x(1)} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={major ? 1 : 0.5} />
                </g>
              );
            })}
            <rect x={x(0)} y={y(1)} width={plot} height={plot} fill="none" stroke="var(--hairline)" />
            {ticks.map((t) => (
              <g key={t} className="num" fontSize={font} fill="var(--ink-2)">
                <line x1={x(0) - 5} x2={x(0)} y1={y(t)} y2={y(t)} stroke="var(--ink)" />
                <text x={x(0) - 9} y={y(t) + font / 3} textAnchor="end">
                  {pct(t, 0)}
                </text>
                <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(0) + 5} stroke="var(--ink)" />
                <text x={x(t)} y={y(0) + 9 + font} textAnchor="middle">
                  {pct(t, 0)}
                </text>
              </g>
            ))}
            <text x={x(0.5)} y={H - 4} textAnchor="middle" fontSize={font} fill="var(--ink-2)">
              Stated probability for its pick
            </text>
            <text transform={`translate(${font} ${y(0.5)}) rotate(-90)`} textAnchor="middle" fontSize={font} fill="var(--ink-2)">
              Actual accuracy
            </text>
            <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--ink)" strokeWidth="1" strokeDasharray="4 3" />
          </g>

          {MODELS.map((m) => (
            <polyline
              key={m}
              aria-hidden
              points={bins[m][strategy].map((b) => `${x(b.mean_p)},${y(b.accuracy)}`).join(" ")}
              fill="none"
              stroke={COLOR[m]}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          ))}

          {marks.map(({ m, b, s }) => {
            const key = `${m}-${b.bin}`;
            const common = {
              tabIndex: 0,
              role: "img",
              "aria-label": tipText({ model: m, b }),
              fill: COLOR[m],
              stroke: "var(--paper)",
              strokeWidth: 2,
              onMouseEnter: () => setTip({ model: m, b }),
              onMouseLeave: () => setTip(null),
              onFocus: () => {
                setTip({ model: m, b });
                setFocused(key);
              },
              onBlur: () => {
                setTip(null);
                setFocused(null);
              },
              style: { outline: "none" },
            } as const;
            const cx = x(b.mean_p);
            const cy = y(b.accuracy);
            return (
              <g key={key}>
                {m === "jev-1.14.0" ? (
                  <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} {...common} />
                ) : (
                  <circle cx={cx} cy={cy} r={s / 2} {...common} />
                )}
                {focused === key && <rect x={cx - s / 2 - 4} y={cy - s / 2 - 4} width={s + 8} height={s + 8} fill="none" stroke="var(--ink)" strokeWidth="2" pointerEvents="none" />}
              </g>
            );
          })}

          {ends.map((e) => (
            <text key={e.m} x={x(1) + 10} y={e.y + font / 3} fontSize={font} fill={COLOR[e.m]} fontWeight={500} className="num">
              {e.m}
            </text>
          ))}
        </svg>
        {tip && (
          <div
            role="status"
            className="num pointer-events-none absolute z-10 border border-hairline bg-raised px-2 py-1 text-xs whitespace-nowrap"
            style={{
              left: Math.min(x(tip.b.mean_p) + 10, Math.max(0, width - 260)),
              top: y(tip.b.accuracy) + 12,
            }}
          >
            {tipText(tip)}
          </div>
        )}
      </div>
    </div>
  );
}

/** The chart's data, for the accessible table under Fig. 2. */
export function ReliabilityTable({ bins }: { bins: Record<Model, Record<Strategy, ReliabilityBin[]>> }) {
  return (
    <details className="no-print mt-4 text-xs">
      <summary>Show the chart data as a table</summary>
      <div className="mt-3 overflow-x-auto">
      <table className="num w-full max-w-[640px] text-left">
        <caption className="sr-only">Reliability bins for both models and both question strategies</caption>
        <thead className="text-ink-2">
          <tr className="border-b border-ink">
            <th className="py-1.5 pr-3 font-normal">Questions</th>
            <th className="py-1.5 pr-3 font-normal">Model</th>
            <th className="py-1.5 pr-3 font-normal">Stated probability</th>
            <th className="py-1.5 pr-3 text-right font-normal">Tickets</th>
            <th className="py-1.5 pr-3 text-right font-normal">Mean stated</th>
            <th className="py-1.5 text-right font-normal">Actually right</th>
          </tr>
        </thead>
        <tbody>
          {STRATEGIES.flatMap((s) =>
            MODELS.flatMap((m) =>
              bins[m][s].map((b) => (
                <tr key={`${s}-${m}-${b.bin}`} className="border-b border-hairline">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{STRATEGY_LABEL[s]}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{m}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {b.lo.toFixed(1)} to {b.hi.toFixed(1)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{int(b.n)}</td>
                  <td className="py-1.5 pr-3 text-right">{pct(b.mean_p)}</td>
                  <td className="py-1.5 text-right">{pct(b.accuracy)}</td>
                </tr>
              )),
            ),
          )}
        </tbody>
      </table>
      </div>
    </details>
  );
}
