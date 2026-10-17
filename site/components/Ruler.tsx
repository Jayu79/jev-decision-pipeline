"use client";

import { useRef } from "react";
import { cutoff as fmtCutoff } from "@/lib/format";
import type { CoverageAt } from "@/lib/types";

const MIN = 0.5;
const MAX = 1;
const TICKS = Array.from({ length: 51 }, (_, i) => Math.round((MIN + i * 0.01) * 100) / 100);
const pos = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// Layout of the scale, top to bottom (px).
const TAG = 22; // value tag
const LABEL_Y = 38; // tick labels
const TICK_TOP = 46; // major ticks start; minor ticks start at TICK_TOP + 6
const BASE = 58; // baseline
const MARK_Y = BASE + 4; // target marks hang below the baseline

/**
 * The cutoff as a ruler from 0.50 to 1.00: a fine tick every 0.01, a taller
 * labelled tick every 0.05, a hairline cursor with a signal-yellow tag, and
 * the measured cutoff for each accuracy target marked on the scale.
 */
export function Ruler({
  value,
  onChange,
  marks,
  valueText,
}: {
  value: number;
  onChange: (v: number) => void;
  marks: CoverageAt[];
  valueText: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const reachable = marks.filter((m) => m.cutoff !== null);
  const unreachable = marks.filter((m) => m.cutoff === null);

  const fromPointer = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    const v = MIN + ((clientX - rect.left) / rect.width) * (MAX - MIN);
    onChange(clamp(Math.round(v * 100) / 100));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const cents = value * 100;
    const up = (d: number) => (Math.floor(cents + 1e-6) + d) / 100;
    const down = (d: number) => (Math.ceil(cents - 1e-6) - d) / 100;
    const next: Record<string, number> = {
      ArrowRight: up(1),
      ArrowUp: up(1),
      ArrowLeft: down(1),
      ArrowDown: down(1),
      PageUp: up(5),
      PageDown: down(5),
      Home: MIN,
      End: MAX,
    };
    if (e.key in next) {
      e.preventDefault();
      onChange(clamp(Math.round(next[e.key] * 100) / 100));
    }
  };

  const x = pos(value);
  return (
    <div className="relative select-none" style={{ height: MARK_Y + (unreachable.length ? 56 : 34) }}>
      <div
        ref={track}
        id="cutoff"
        role="slider"
        tabIndex={0}
        aria-label="Confidence cutoff"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e.clientX)}
        className="absolute inset-x-0 top-0 cursor-ew-resize touch-none"
        style={{ height: BASE + 2 }}
      >
        <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <line x1="0%" x2="100%" y1={BASE} y2={BASE} stroke="var(--ink)" strokeWidth="1" />
          {TICKS.map((t, i) => {
            const major = i % 5 === 0;
            return (
              <g key={t}>
                <line
                  x1={`${pos(t)}%`}
                  x2={`${pos(t)}%`}
                  y1={major ? TICK_TOP : TICK_TOP + 6}
                  y2={BASE}
                  stroke={major ? "var(--ink)" : "var(--ink-2)"}
                  strokeWidth="1"
                  shapeRendering="crispEdges"
                />
                {major && (
                  <text
                    x={`${pos(t)}%`}
                    y={LABEL_Y}
                    textAnchor={i === 0 ? "start" : i === 50 ? "end" : "middle"}
                    className={`num fill-ink-2 text-xs ${i % 10 === 5 ? "max-[480px]:hidden" : ""}`}
                  >
                    {t.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {/* Cursor: a hairline through the scale, with the value on a yellow tag. */}
        <div aria-hidden className="pointer-events-none absolute top-0 bottom-0" style={{ left: `${x}%` }}>
          <div className="absolute w-px bg-ink" style={{ top: TAG, bottom: -6, left: 0 }} />
          <div
            className="num absolute top-0 bg-signal px-1.5 text-xs leading-[22px] font-semibold whitespace-nowrap text-ink"
            style={{
              height: TAG,
              transform: `translateX(${x < 6 ? "0" : x > 94 ? "-100%" : "-50%"})`,
            }}
          >
            {fmtCutoff(value)}
          </div>
        </div>
      </div>

      {/* Target marks, at the cutoff each accuracy target needs. */}
      {reachable.map((m) => {
        const on = same(value, m.cutoff as number);
        const label = `${Math.round(m.target * 100)}%`;
        return (
          <button
            key={m.target}
            type="button"
            aria-pressed={on}
            aria-label={`Set the cutoff to ${fmtCutoff(m.cutoff as number)}, the measured cutoff for ${label} accuracy`}
            onClick={() => onChange(m.cutoff as number)}
            className="group absolute flex -translate-x-1/2 flex-col items-center px-1"
            style={{ left: `${pos(m.cutoff as number)}%`, top: MARK_Y }}
          >
            <svg width="10" height="7" aria-hidden className="block">
              <path d="M5 0 L10 7 L0 7 Z" fill={on ? "var(--signal)" : "var(--paper)"} stroke="var(--ink)" strokeWidth="1" />
            </svg>
            <span className={`num mt-0.5 text-xs ${on ? "font-semibold text-ink" : "text-ink-2 group-hover:text-ink group-hover:underline"}`}>
              {label}
            </span>
          </button>
        );
      })}
      {unreachable.length > 0 && (
        <p className="num caption absolute right-0 text-right" style={{ top: MARK_Y + 34 }}>
          {unreachable.map((m) => `${Math.round(m.target * 100)}%`).join(" and ")}: not reachable at any cutoff
        </p>
      )}
    </div>
  );
}
