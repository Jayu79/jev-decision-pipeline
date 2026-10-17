"use client";

import { useEffect, useRef, useState } from "react";
import { cutoff as fmtCutoff } from "@/lib/format";

const FILL_MS = 600;
const TAP_RADIUS = 12;

/**
 * Every ticket as one dot, highest confidence first, row by row. Right answers
 * are small filled graphite dots, wrong ones vermilion rings, so the two differ
 * by shape as well as color. Tickets below the cutoff fade to 18%, a stepped
 * line (signal yellow with a graphite core) marks the split, and a yellow mark
 * at the grid's left edge shows the row where the cutoff falls.
 *
 * First load: if any part of the grid is in view when the page loads, it is
 * drawn at once. Otherwise it fills in, in sorted order, the first time any
 * part of it scrolls into view. Never animated under reduced motion.
 */
export function DotGrid({
  correct,
  confidence,
  cols,
  handled,
  onPick,
}: {
  correct: ArrayLike<number>;
  /** Per-dot confidence, for the hover note; absent until the full data loads. */
  confidence?: number[];
  cols: number;
  handled: number;
  onPick?: (sortedIndex: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const phase = useRef<"waiting" | "filling" | "done">("waiting");
  const shown = useRef(0);
  const raf = useRef(0);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const n = correct.length;
  const rows = Math.ceil(n / cols);
  const pitch = width / cols;
  const height = rows * pitch;
  // Where the split line meets the grid's left edge.
  const splitRow = Math.floor(handled / cols);
  const markerY = handled % cols === 0 ? splitRow * pitch : (splitRow + 1) * pitch;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, []);

  // Drawing reads the latest props through a ref so the fill-in can call it per frame.
  const draw = useRef<(count: number) => void>(() => {});
  draw.current = (count: number) => {
    const c = canvas.current;
    if (!c || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(width * dpr);
    const H = Math.round(height * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
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
        if (!correct[i]) continue;
        const x = (i % cols) * pitch + pitch / 2;
        const y = Math.floor(i / cols) * pitch + pitch / 2;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        if (correct[i]) continue;
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
      const col = handled % cols;
      const path = () => {
        ctx.beginPath();
        if (col === 0) {
          ctx.moveTo(0, splitRow * pitch);
          ctx.lineTo(width, splitRow * pitch);
        } else {
          ctx.moveTo(0, (splitRow + 1) * pitch);
          ctx.lineTo(col * pitch, (splitRow + 1) * pitch);
          ctx.lineTo(col * pitch, splitRow * pitch);
          ctx.lineTo(width, splitRow * pitch);
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

  // Decide, once the grid has a size, whether to draw at once or fill in later.
  useEffect(() => {
    const el = wrap.current;
    if (!el || width === 0 || phase.current !== "waiting") return;
    const rect = el.getBoundingClientRect();
    const inView = rect.bottom > 0 && rect.top < window.innerHeight;
    if (inView || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      phase.current = "done";
      draw.current(n);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || phase.current !== "waiting") return;
        io.disconnect();
        phase.current = "filling";
        const start = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - start) / FILL_MS);
          shown.current = p >= 1 ? n : Math.floor((1 - Math.pow(1 - p, 2)) * n);
          draw.current(shown.current);
          if (p < 1) raf.current = requestAnimationFrame(step);
          else phase.current = "done";
        };
        raf.current = requestAnimationFrame(step);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [width, n]);

  useEffect(() => {
    if (phase.current === "done") draw.current(n);
  }, [correct, handled, width, height, n]);

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
    // The aspect ratio reserves the grid's space before anything is drawn.
    <div ref={wrap} className="relative w-full" style={{ aspectRatio: `${cols} / ${rows}` }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${n} tickets as dots, highest confidence first. ${handled} are at or above the cutoff.`}
        className="absolute inset-0 block h-full w-full"
        style={{ cursor: onPick && hover && hover.i >= 0 ? "pointer" : "default" }}
        onPointerMove={(e) => e.pointerType === "mouse" && setHover(nearest(e.clientX, e.clientY))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const { i } = nearest(e.clientX, e.clientY);
          if (i >= 0 && onPick) onPick(i);
        }}
      />
      {width > 0 && (
        <svg
          aria-hidden
          width="10"
          height="10"
          className="pointer-events-none absolute -left-3.5 overflow-visible"
          style={{ top: Math.max(0, Math.min(height, markerY)) - 5 }}
        >
          <path d="M0.5 0.5 L9.5 5 L0.5 9.5 Z" fill="var(--signal)" stroke="var(--ink)" strokeWidth="1" />
        </svg>
      )}
      {hover && hover.i >= 0 && confidence && (
        <div
          className="num pointer-events-none absolute z-10 border border-hairline bg-raised px-2 py-1 text-xs whitespace-nowrap"
          style={{ left: Math.min(hover.x + 14, Math.max(0, width - 230)), top: hover.y + 16 }}
        >
          Confidence {fmtCutoff(confidence[hover.i])}, {correct[hover.i] ? "right" : "wrong"}. Click to read it.
        </div>
      )}
    </div>
  );
}
