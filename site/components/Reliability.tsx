"use client";

import { useState } from "react";
import { N } from "./N";
import { ModelLabel, Segmented } from "./Segmented";
import { int, pct } from "@/lib/format";
import { MODELS, STRATEGIES, STRATEGY_LABEL, type Model, type ReliabilityBin, type Strategy } from "@/lib/types";

const W = 600;
const H = 420;
const M = { l: 56, r: 20, t: 20, b: 56 };
const x = (v: number) => M.l + v * (W - M.l - M.r);
const y = (v: number) => H - M.b - v * (H - M.t - M.b);
const COLOR: Record<Model, string> = { "jev-1.13.0": "var(--m113)", "jev-1.14.0": "var(--m114)" };

type Tip = { model: Model; b: ReliabilityBin };

export function Reliability({ bins }: { bins: Record<Model, Record<Strategy, ReliabilityBin[]>> }) {
  const [strategy, setStrategy] = useState<Strategy>("flat");
  const [tip, setTip] = useState<Tip | null>(null);
  const maxN = Math.max(...MODELS.flatMap((m) => bins[m][strategy].map((b) => b.n)));
  const size = (n: number) => 3 + 10 * Math.sqrt(n / maxN);
  const tipText = (t: Tip) =>
    `${t.model}: said ${pct(t.b.mean_p, 0)}, right ${pct(t.b.accuracy, 0)}, ${int(t.b.n)} tickets`;

  return (
    <div>
      <Segmented
        label="Questions"
        value={strategy}
        onChange={(s) => {
          setStrategy(s);
          setTip(null);
        }}
        options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))}
      />
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-steel">
        {MODELS.map((m) => (
          <li key={m}>
            <ModelLabel model={m} />
          </li>
        ))}
        <li className="flex items-center gap-2">
          <svg width="22" height="6" aria-hidden>
            <line x1="0" y1="3" x2="22" y2="3" stroke="var(--steel)" strokeDasharray="4 3" strokeWidth="1.5" />
          </svg>
          Perfectly calibrated
        </li>
        <li>Bigger points cover more tickets.</li>
      </ul>

      <div className="relative mt-4 max-w-[760px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label="Reliability diagram">
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
            <g key={t}>
              <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
              <text x={x(0) - 10} y={y(t) + 5} textAnchor="end" fontSize="14" fill="var(--steel)">
                {pct(t, 0)}
              </text>
              <text x={x(t)} y={y(0) + 22} textAnchor="middle" fontSize="14" fill="var(--steel)">
                {pct(t, 0)}
              </text>
            </g>
          ))}
          <text x={x(0.5)} y={H - 8} textAnchor="middle" fontSize="15" fill="var(--steel)">
            Stated probability for its pick
          </text>
          <text transform={`translate(16 ${y(0.5)}) rotate(-90)`} textAnchor="middle" fontSize="15" fill="var(--steel)">
            Actual accuracy
          </text>
          <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--steel)" strokeDasharray="5 4" strokeWidth="1.5" />

          {MODELS.map((m) => {
            const bs = bins[m][strategy];
            return (
              <g key={m}>
                <polyline
                  points={bs.map((b) => `${x(b.mean_p)},${y(b.accuracy)}`).join(" ")}
                  fill="none"
                  stroke={COLOR[m]}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                {bs.map((b) => {
                  const s = size(b.n);
                  const common = {
                    tabIndex: 0,
                    role: "img",
                    "aria-label": tipText({ model: m, b }),
                    fill: COLOR[m],
                    stroke: "var(--surface)",
                    strokeWidth: 2,
                    onMouseEnter: () => setTip({ model: m, b }),
                    onMouseLeave: () => setTip(null),
                    onFocus: () => setTip({ model: m, b }),
                    onBlur: () => setTip(null),
                    style: { outline: "none" },
                  } as const;
                  return m === "jev-1.14.0" ? (
                    <rect key={b.bin} x={x(b.mean_p) - s} y={y(b.accuracy) - s} width={s * 2} height={s * 2} rx={2} {...common} />
                  ) : (
                    <circle key={b.bin} cx={x(b.mean_p)} cy={y(b.accuracy)} r={s} {...common} />
                  );
                })}
              </g>
            );
          })}
          {tip && (
            <circle
              cx={x(tip.b.mean_p)}
              cy={y(tip.b.accuracy)}
              r={size(tip.b.n) + 5}
              fill="none"
              stroke="var(--ink)"
              strokeWidth="2"
              pointerEvents="none"
            />
          )}
        </svg>
        {tip && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm whitespace-nowrap shadow-sm"
            style={{
              left: `${Math.min((x(tip.b.mean_p) / W) * 100, 62)}%`,
              top: `${(y(tip.b.accuracy) / H) * 100 + 5}%`,
            }}
          >
            <N>{tipText(tip)}</N>
          </div>
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary>Show the chart data as a table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <caption className="sr-only">Reliability bins, {STRATEGY_LABEL[strategy]}</caption>
            <thead className="text-steel">
              <tr className="border-b border-rule">
                <th className="py-2 pr-4 font-medium">Model</th>
                <th className="py-2 pr-4 font-medium">Stated probability</th>
                <th className="py-2 pr-4 font-medium">Tickets</th>
                <th className="py-2 pr-4 font-medium">Mean stated</th>
                <th className="py-2 font-medium">Actually right</th>
              </tr>
            </thead>
            <tbody>
              {MODELS.flatMap((m) =>
                bins[m][strategy].map((b) => (
                  <tr key={`${m}-${b.bin}`} className="border-b border-rule last:border-0">
                    <td className="py-2 pr-4"><N>{m}</N></td>
                    <td className="py-2 pr-4"><N>
                      {b.lo.toFixed(1)} to {b.hi.toFixed(1)}
                    </N></td>
                    <td className="py-2 pr-4"><N>{int(b.n)}</N></td>
                    <td className="py-2 pr-4"><N>{pct(b.mean_p)}</N></td>
                    <td className="py-2"><N>{pct(b.accuracy)}</N></td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
