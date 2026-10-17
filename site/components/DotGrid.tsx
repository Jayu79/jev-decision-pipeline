"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroSeries } from "@/lib/types";
import { cutoff as fmtCutoff } from "@/lib/format";

const FILL_MS = 600;
const TAP_RADIUS = 12;

/**
 * Every ticket as one dot, highest confidence first, row by row. Right answers
 * are small filled graphite dots, wrong ones vermilion rings, so the two differ
 * by shape as well as color. Tickets below the cutoff fade to 18%, and a
 * stepped line (signal yellow with a graphite core) marks the split.
 */
export function DotGrid({
  series,
  cols,
  handled,
  onPick,
}: {
  series: HeroSeries;
  cols: number;
  handled: number;
  onPick: (sortedIndex: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const shown = useRef(-1); // dots revealed so far; -1 until the fill-in has run
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const n = series.confidence.length;
  const rows = Math.ceil(n / cols);
  const pitch = width / cols;
  const height = Math.round(rows * pitch);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drawing reads the latest props through a ref so the fill-in can call it per frame.
  const draw = useRef<(count: number) => void>(() => {});
  draw.current = (count: number) => {
    const c = canvas.current;
    if (!c || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const css = getComputedStyle(c);
    const ink = css.getPropertyValue("--ink").trim();
    const wrong = css.getPropertyValue("--wrong").trim();
    const signal = css.getPropertyValue("--signal").trim();
    const r = Math.max(1, pitch * 0.3);
    const ring = Math.max(1, pitch * 0.12);
    const ringR = Math.max(1, pitch * 0.34 - ring / 2);

    const pass = (from: number, to: number, alpha: number) => {
      if (to <= from) return;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        if (!series.correct[i]) continue;
        const x = (i % cols) * pitch + pitch / 2;
        const y = Math.floor(i / cols) * pitch + pitch / 2;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        if (series.correct[i]) continue;
        const x = (i % cols) * pitch + pitch / 2;
        const y = Math.floor(i / cols) * pitch + pitch / 2;
        ctx.moveTo(x + ringR, y);
        ctx.arc(x, y, ringR, 0, Math.PI * 2);
      }
      ctx.strokeStyle = wrong;
      ctx.lineWidth = ring;
      ctx.stroke();
    };
    pass(0, Math.min(handled, count), 1);
    pass(handled, count, 0.18);

    if (count >= n && handled > 0 && handled < n) {
      const row = Math.floor(handled / cols);
      const col = handled % cols;
      const path = () => {
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
      };
      ctx.globalAlpha = 1;
      ctx.lineJoin = "miter";
      path();
      ctx.strokeStyle = signal;
      ctx.lineWidth = 4;
      ctx.stroke();
      path();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  // The page's one orchestrated moment: the field fills in sorted order, once.
  useEffect(() => {
    if (width === 0) return;
    if (shown.current >= 0) {
      draw.current(n);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shown.current = n;
      draw.current(n);
      return;
    }
    shown.current = 0;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / FILL_MS);
      const eased = 1 - Math.pow(1 - p, 2);
      shown.current = p >= 1 ? n : Math.floor(eased * n);
      draw.current(shown.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      shown.current = n;
    };
  }, [width, n]);

  useEffect(() => {
    if (shown.current >= n) draw.current(n);
  }, [series, handled, width, height, n]);

  // Nearest dot within TAP_RADIUS of the pointer (a fingertip is wider than a dot).
  const nearest = (clientX: number, clientY: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(x / pitch)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y / pitch)));
    const i = row * cols + col;
    const cx = col * pitch + pitch / 2;
    const cy = row * pitch + pitch / 2;
    const ok = i < n && Math.hypot(x - cx, y - cy) <= Math.max(TAP_RADIUS, pitch / 2);
    return { i: ok ? i : -1, x, y };
  };

  return (
    <div ref={wrap} className="relative w-full">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${n} tickets as dots, highest confidence first. ${handled} are at or above the cutoff.`}
        style={{ width: "100%", height, display: "block", cursor: hover && hover.i >= 0 ? "pointer" : "default" }}
        onPointerMove={(e) => e.pointerType === "mouse" && setHover(nearest(e.clientX, e.clientY))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const { i } = nearest(e.clientX, e.clientY);
          if (i >= 0) onPick(i);
        }}
      />
      {hover && hover.i >= 0 && (
        <div
          className="num pointer-events-none absolute z-10 border border-hairline bg-raised px-2 py-1 text-xs whitespace-nowrap"
          style={{ left: Math.min(hover.x + 14, Math.max(0, width - 230)), top: hover.y + 16 }}
        >
          Confidence {fmtCutoff(series.confidence[hover.i])}, {series.correct[hover.i] ? "right" : "wrong"}. Click to read it.
        </div>
      )}
    </div>
  );
}
