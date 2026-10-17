"use client";

import { useEffect, useRef, useState } from "react";
import { Breakable } from "./Layout";

export type Step = { name: string; detail: string[]; decision: string; why: string };

type Box = { x: number; y: number; w: number; h: number };

const BOX_W = 196;
const BOX_H = 74;

/** Horizontal drawing: ingest along the top, decide and report along the bottom. */
function wideLayout(): { w: number; h: number; boxes: Box[]; wires: [number, number, string][] } {
  const col = (i: number) => 10 + i * 268;
  const top = 46;
  const bottom = 236;
  const boxes: Box[] = [
    { x: col(0), y: top, w: BOX_W, h: BOX_H }, // 1 Producer
    { x: col(1), y: top, w: BOX_W, h: BOX_H }, // 2 Kafka
    { x: col(2), y: top, w: BOX_W, h: BOX_H }, // 3 ClickHouse
    { x: col(2), y: bottom, w: BOX_W, h: BOX_H }, // 4 Airflow
    { x: col(3), y: bottom, w: BOX_W, h: BOX_H }, // 5 Jev API
    { x: col(1), y: bottom, w: BOX_W, h: BOX_H }, // 6 ClickHouse tables
    { x: col(0), y: bottom, w: BOX_W, h: BOX_H }, // 7 Report
  ];
  return { w: col(3) + BOX_W + 10, h: bottom + BOX_H + 12, boxes, wires: [[0, 1, ""], [1, 2, ""], [2, 3, "raw_tickets"], [3, 4, "both"], [3, 5, ""], [5, 6, ""]] };
}

/** Vertical drawing for narrow screens: the same seven parts in order. */
function tallLayout(width: number): { w: number; h: number; boxes: Box[]; wires: [number, number, string][] } {
  const w = Math.max(260, width);
  const boxW = w - 58;
  const gap = 34;
  const boxes = Array.from({ length: 7 }, (_, i) => ({ x: 48, y: 10 + i * (BOX_H + gap), w: boxW, h: BOX_H }));
  // Flow order in this layout is simply 1 to 7.
  return { w, h: 10 + 7 * (BOX_H + gap) - gap + 10, boxes, wires: [[0, 1, ""], [1, 2, ""], [2, 3, ""], [3, 4, ""], [4, 5, ""], [5, 6, ""]] };
}

/** Where a wire leaves box a and enters box b: the facing edges' midpoints. */
function ends(a: Box, b: Box): [number, number, number, number] {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (Math.abs(ac.y - bc.y) < 1) {
    return ac.x < bc.x ? [a.x + a.w, ac.y, b.x, bc.y] : [a.x, ac.y, b.x + b.w, bc.y];
  }
  return ac.y < bc.y ? [ac.x, a.y + a.h, bc.x, b.y] : [ac.x, a.y, bc.x, b.y + b.h];
}

/** Fig. 5: the pipeline as a technical drawing with numbered callouts. */
export function Schematic({ steps }: { steps: Step[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [open, setOpen] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tall = width < 720;
  const L = tall ? tallLayout(width) : wideLayout();
  // Wide drawing scales to fit; the tall one is drawn at real size, so text stays at 12px or more.
  const scale = tall ? 1 : Math.min(1, width / L.w);
  const s = steps[open];

  const pick = (i: number) => setOpen(i);

  return (
    <div>
      <div ref={wrap} className="w-full">
        <svg
          width={L.w * scale}
          height={L.h * scale}
          viewBox={`0 0 ${L.w} ${L.h}`}
          role="group"
          aria-label="Pipeline drawing. Each numbered part is a button that shows its design decision below."
          className="block overflow-visible"
        >
          <defs>
            <marker id="arrow" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0 0.8 L7.5 4 L0 7.2" fill="none" stroke="var(--ink)" strokeWidth="1" />
            </marker>
          </defs>

          {L.wires.map(([a, b, label]) => {
            const [x1, y1, x2, y2] = ends(L.boxes[a], L.boxes[b]);
            const both = label === "both";
            return (
              <g key={`${a}-${b}`} aria-hidden>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth="1" markerEnd="url(#arrow)" markerStart={both ? "url(#arrow)" : undefined} />
                {label && label !== "both" && (
                  <text
                    x={(x1 + x2) / 2 + (x1 === x2 ? 8 : 0)}
                    y={(y1 + y2) / 2 + (x1 === x2 ? 4 : -8)}
                    textAnchor={x1 === x2 ? "start" : "middle"}
                    fontSize="12"
                    fill="var(--ink-2)"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}

          {L.boxes.map((b, i) => {
            const on = i === open;
            const step = steps[i];
            // Callout: a numbered circle off the box's top-left corner, on a short leader.
            const cx = b.x - (tall ? 26 : 0) + (tall ? 0 : 14);
            const cy = tall ? b.y + 18 : b.y - 22;
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
                <text x={b.x + 12} y={b.y + 24} fontSize="14" fontWeight="600" fill="var(--ink)">
                  {step.name}
                </text>
                {step.detail.map((line, k) => (
                  <text key={k} x={b.x + 12} y={b.y + 44 + k * 16} fontSize="12" fill="var(--ink-2)">
                    {line}
                  </text>
                ))}
                <line
                  x1={cx}
                  y1={cy}
                  x2={tall ? b.x : cx}
                  y2={tall ? cy : b.y}
                  stroke="var(--ink)"
                  strokeWidth="1"
                  aria-hidden
                />
                <circle cx={cx} cy={cy} r="11" fill={on ? "var(--ink)" : "var(--paper)"} stroke="var(--ink)" strokeWidth="1" />
                <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={on ? "var(--paper)" : "var(--ink)"} className="num">
                  {i + 1}
                </text>
                {focus === i && (
                  <rect x={b.x - 5} y={b.y - 5} width={b.w + 10} height={b.h + 10} fill="none" stroke="var(--ink)" strokeWidth="2" pointerEvents="none" />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div id="pipeline-step" aria-live="polite" className="mt-8 max-w-[66ch] border-t border-ink pt-3">
        <p className="num text-xs text-ink-2">
          {open + 1} of {steps.length}: {s.name}
        </p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight">{s.decision}</h3>
        <p className="prose-text mt-2">
          <Breakable text={s.why} />
        </p>
      </div>
    </div>
  );
}
