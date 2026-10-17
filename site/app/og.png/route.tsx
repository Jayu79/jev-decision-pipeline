// The link preview: the dot field with its cutoff line, the title, and the headline result.
// Rendered at build time from the same data files as the page.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getHero, getMeta, getSummary, getTicketCount } from "@/lib/data";
import { int, pct } from "@/lib/format";
import { DEFAULT, readout } from "@/lib/metrics";

// A static route (not the opengraph-image file convention) so the export is a real .png file.
export const dynamic = "force-static";
const size = { width: 1200, height: 630 };

const font = (f: string) => readFileSync(join(process.cwd(), "assets", "og", f));
// Satori skips the font's kerning, so a full space after a comma reads too wide.
const t = (s: string) => s.replace(/, /g, ",\u2009");

export function GET() {
  const series = getHero()[DEFAULT.model][DEFAULT.strategy];
  const target = getSummary()[DEFAULT.model][DEFAULT.strategy].coverage_at.find((c) => c.target === 0.95)!;
  const cut = target.cutoff ?? DEFAULT.cut;
  const r = readout(series, cut);
  const meta = getMeta();
  const cols = meta.areas.reduce((n, a) => n + a.intents.length, 0);
  const n = series.confidence.length;
  const rows = Math.ceil(n / cols);
  const pitch = 8.4;
  const W = cols * pitch;
  const H = rows * pitch;

  const dots = series.correct.map((c, i) => {
    const x = (i % cols) * pitch + pitch / 2;
    const y = Math.floor(i / cols) * pitch + pitch / 2;
    const o = i < r.handled ? 1 : 0.18;
    return c ? (
      <circle key={i} cx={x} cy={y} r={2.5} fill="#1D2124" fillOpacity={o} />
    ) : (
      <circle key={i} cx={x} cy={y} r={2.4} fill="none" stroke="#D9480F" strokeWidth={1.1} strokeOpacity={o} />
    );
  });
  const row = Math.floor(r.handled / cols);
  const col = r.handled % cols;
  const split =
    col === 0
      ? `M0 ${row * pitch} H${W}`
      : `M0 ${(row + 1) * pitch} H${col * pitch} V${row * pitch} H${W}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#F5F6F4", padding: "56px 64px", color: "#1D2124" }}>
        <div style={{ display: "flex", fontFamily: "Archivo Expanded", fontSize: 84, fontWeight: 600, letterSpacing: -1 }}>{t("Jev, calibrated")}</div>
        <div style={{ display: "flex", marginTop: 10, fontFamily: "Archivo", fontSize: 36, fontWeight: 600 }}>
          {`${pct(r.handled / r.n)} handled at 95% accuracy`}
        </div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            {dots}
            <path d={split} fill="none" stroke="#F2B705" strokeWidth={4} />
            <path d={split} fill="none" stroke="#1D2124" strokeWidth={1} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Archivo", fontSize: 21, lineHeight: 1.45, color: "#5A6168", width: 380 }}>
            <div style={{ display: "flex" }}>{t(`${meta.source.dataset}, ${int(getTicketCount())} tickets`)}</div>
            <div style={{ display: "flex" }}>{t(`${DEFAULT.model}, flat question, cutoff ${cut.toFixed(2)}`)}</div>
            <div style={{ display: "flex" }}>{t(`${int(r.handled)} handled, ${int(r.toPerson)} to a person`)}</div>
            <div style={{ display: "flex", marginTop: 18, color: "#1D2124", fontWeight: 600 }}>Jayanth Veeramachaneni</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Archivo Expanded", data: font("ArchivoExpanded-SemiBold.ttf"), weight: 600, style: "normal" },
        { name: "Archivo", data: font("Archivo-Regular.ttf"), weight: 400, style: "normal" },
        { name: "Archivo", data: font("Archivo-SemiBold.ttf"), weight: 600, style: "normal" },
      ],
    },
  );
}
