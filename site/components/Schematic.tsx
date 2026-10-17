"use client";

import { useState } from "react";
import { Breakable } from "./Layout";

export type Step = { name: string; detail: string[]; decision: string; why: string };

type Box = { x: number; y: number; w: number; h: number };
type Drawing = { id: string; w: number; h: number; boxes: Box[]; wires: [number, number, string][]; callout: (b: Box) => [number, number, number, number] };

const BOX_H = 92;

/** 768px and up: ingest along the top, decide and report along the bottom. */
const WIDE: Drawing = (() => {
  const boxW = 170;
  const col = (i: number) => 10 + i * 210;
  const top = 46;
  const bottom = top + BOX_H + 100;
  const at = (c: number, y: number): Box => ({ x: col(c), y, w: boxW, h: BOX_H });
  return {
    id: "wide",
    w: col(3) + boxW + 10,
    h: bottom + BOX_H + 12,
    // In step order: Producer, Kafka, ClickHouse, Airflow, Jev API, ClickHouse tables, Report.
    boxes: [at(0, top), at(1, top), at(2, top), at(2, bottom), at(3, bottom), at(1, bottom), at(0, bottom)],
    wires: [[0, 1, ""], [1, 2, ""], [2, 3, "raw_tickets"], [3, 4, "both"], [3, 5, ""], [5, 6, ""]],
    // Callout above the box's top-left corner, on a short vertical leader.
    callout: (b) => [b.x + 14, b.y - 22, b.x + 14, b.y],
  };
})();

/** Below 768px: the same seven parts stacked top to bottom. */
const TALL: Drawing = (() => {
  const gap = 30;
  const boxes = Array.from({ length: 7 }, (_, i) => ({ x: 46, y: 10 + i * (BOX_H + gap), w: 264, h: BOX_H }));
  return {
    id: "tall",
    w: 320,
    h: 10 + 7 * (BOX_H + gap) - gap + 10,
    boxes,
    wires: [[0, 1, ""], [1, 2, ""], [2, 3, ""], [3, 4, "both"], [4, 5, ""], [5, 6, ""]],
    // Callout to the box's left, on a short horizontal leader.
    callout: (b) => [b.x - 26, b.y + 20, b.x, b.y + 20],
  };
})();

/** Where a wire leaves box a and enters box b: the facing edges' midpoints. */
function ends(a: Box, b: Box): [number, number, number, number] {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (Math.abs(ac.y - bc.y) < 1) return ac.x < bc.x ? [a.x + a.w, ac.y, b.x, bc.y] : [a.x, ac.y, b.x + b.w, bc.y];
  return ac.y < bc.y ? [ac.x, a.y + a.h, bc.x, b.y] : [ac.x, a.y, bc.x, b.y + b.h];
}

function Drawing({ d, steps, open, pick, className }: { d: Drawing; steps: Step[]; open: number; pick: (i: number) => void; className: string }) {
  const [focus, setFocus] = useState<number | null>(null);
  const arrow = `arrow-${d.id}`;
  return (
    <svg
      viewBox={`0 0 ${d.w} ${d.h}`}
      width="100%"
      role="group"
      aria-label="Pipeline drawing. Each numbered part is a button that shows its design decision below."
      className={`h-auto ${className}`}
    >
      <defs>
        <marker id={arrow} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0.8 L7.5 4 L0 7.2" fill="none" stroke="var(--ink)" strokeWidth="1" />
        </marker>
      </defs>
      {d.wires.map(([a, b, label]) => {
        const [x1, y1, x2, y2] = ends(d.boxes[a], d.boxes[b]);
        const both = label === "both";
        return (
          <g key={`${a}-${b}`} aria-hidden>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth="1" markerEnd={`url(#${arrow})`} markerStart={both ? `url(#${arrow})` : undefined} />
            {label && !both && (
              <text x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2 + 4} fontSize="12.5" fill="var(--ink-2)">
                {label}
              </text>
            )}
          </g>
        );
      })}
      {d.boxes.map((b, i) => {
        const on = i === open;
        const step = steps[i];
        const [cx, cy, lx, ly] = d.callout(b);
        return (
          <g
            key={step.name}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`${i + 1}. ${step.name}`}
            onClick={() => pick(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pick(i);
              }
            }}
            onFocus={() => setFocus(i)}
            onBlur={() => setFocus(null)}
            className="cursor-pointer"
            style={{ outline: "none" }}
          >
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--paper)" stroke="var(--ink)" strokeWidth={on ? 2 : 1} />
            <text x={b.x + 12} y={b.y + 25} fontSize="15" fontWeight="600" fill="var(--ink)">
              {step.name}
            </text>
            {step.detail.map((line, k) => (
              <text key={k} x={b.x + 12} y={b.y + 47 + k * 16} fontSize="13" fill="var(--ink-2)">
                {line}
              </text>
            ))}
            <line x1={cx} y1={cy} x2={lx} y2={ly} stroke="var(--ink)" strokeWidth="1" aria-hidden />
            <circle cx={cx} cy={cy} r="11" fill={on ? "var(--ink)" : "var(--paper)"} stroke="var(--ink)" strokeWidth="1" />
            <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={on ? "var(--paper)" : "var(--ink)"} className="num">
              {i + 1}
            </text>
            {focus === i && <rect x={b.x - 5} y={b.y - 5} width={b.w + 10} height={b.h + 10} fill="none" stroke="var(--ink)" strokeWidth="2" pointerEvents="none" />}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Fig. 5: the pipeline as a technical drawing with numbered callouts. Two fixed
 * drawings, switched by a CSS media query at 768px, so the page is the right
 * width before any script runs.
 */
export function Schematic({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(0);
  const s = steps[open];
  return (
    <div>
      <Drawing d={WIDE} steps={steps} open={open} pick={setOpen} className="hidden max-w-[820px] md:block" />
      <Drawing d={TALL} steps={steps} open={open} pick={setOpen} className="block max-w-[420px] md:hidden" />
      <div id="pipeline-step" aria-live="polite" className="mt-8 max-w-[66ch] border-t border-ink pt-3">
        <p className="num text-xs text-ink-2">
          {open + 1} of {steps.length}: {s.name}
        </p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight">
          <Breakable text={s.decision} />
        </h3>
        <p className="prose-text mt-2">
          <Breakable text={s.why} />
        </p>
      </div>
    </div>
  );
}
