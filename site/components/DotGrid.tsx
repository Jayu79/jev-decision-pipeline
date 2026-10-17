"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroSeries } from "@/lib/types";
import { cutoff as fmtCutoff } from "@/lib/format";

const COLS = 77;

/**
 * Every ticket as one dot, highest confidence first, row by row. Right answers
 * are filled dots, wrong ones are rings, so the two differ by shape as well as
 * color. Tickets below the cutoff fade, and a stepped line marks the split.
 */
export function DotGrid({
  series,
  handled,
  onPick,
}: {
  series: HeroSeries;
  handled: number;
  onPick: (sortedIndex: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [scheme, setScheme] = useState(0);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const n = series.confidence.length;
  const rows = Math.ceil(n / COLS);
  const pitch = width / COLS;
  const height = Math.round(rows * pitch);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => setScheme((s) => s + 1);
    mq.addEventListener("change", onScheme);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onScheme);
    };
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const css = getComputedStyle(c);
    const right = css.getPropertyValue("--correct").trim();
    const wrong = css.getPropertyValue("--wrong").trim();
    const ink = css.getPropertyValue("--ink").trim();
    const r = pitch * 0.36;
    const ring = Math.max(1, pitch * 0.15);

    const draw = (from: number, to: number, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        if (!series.correct[i]) continue;
        const x = (i % COLS) * pitch + pitch / 2;
        const y = Math.floor(i / COLS) * pitch + pitch / 2;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = right;
      ctx.fill();
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        if (series.correct[i]) continue;
        const x = (i % COLS) * pitch + pitch / 2;
        const y = Math.floor(i / COLS) * pitch + pitch / 2;
        const rr = r - ring / 2;
        ctx.moveTo(x + rr, y);
        ctx.arc(x, y, rr, 0, Math.PI * 2);
      }
      ctx.strokeStyle = wrong;
      ctx.lineWidth = ring;
      ctx.stroke();
    };
    draw(0, handled, 1);
    draw(handled, n, 0.25);

    // Stepped line between the last handled ticket and the first one sent on.
    if (handled > 0 && handled < n) {
      const row = Math.floor(handled / COLS);
      const col = handled % COLS;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (col === 0) {
        ctx.moveTo(0, row * pitch);
        ctx.lineTo(width, row * pitch);
      } else {
        ctx.moveTo(0, (row + 1) * pitch);
        ctx.lineTo(col * pitch, (row + 1) * pitch);
        ctx.lineTo(col * pitch, row * pitch);
        ctx.lineTo(width, row * pitch);
      }
      ctx.stroke();
    }
  }, [series, handled, width, height, pitch, n, scheme]);

  const indexAt = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const i = Math.floor(y / pitch) * COLS + Math.floor(x / pitch);
    return { i: i >= 0 && i < n && x >= 0 && x < width ? i : -1, x, y };
  };

  return (
    <div ref={wrap} className="relative w-full">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${n} tickets as dots, highest confidence first. ${handled} are at or above the cutoff.`}
        style={{ width: "100%", height, display: "block", cursor: hover && hover.i >= 0 ? "pointer" : "default" }}
        onMouseMove={(e) => setHover(indexAt(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const { i } = indexAt(e);
          if (i >= 0) onPick(i);
        }}
      />
      {hover && hover.i >= 0 && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm whitespace-nowrap shadow-sm"
          style={{
            left: Math.min(hover.x + 12, Math.max(0, width - 210)),
            top: hover.y + 16,
          }}
        >
          Confidence {fmtCutoff(series.confidence[hover.i])}, {series.correct[hover.i] ? "right" : "wrong"}.
          Click to read it.
        </div>
      )}
    </div>
  );
}
