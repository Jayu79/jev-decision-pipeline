"""Renders the calibration report as one self-contained HTML page."""

from __future__ import annotations

import html
import json
import os
from datetime import datetime, timezone

import pandas as pd

from .calibration import Results
from .config import settings
from .questions import QUESTION_VERSION

SERIES = {"flat": ("--s1", "Flat 77-way Choice"),
          "fanout": ("--s2", "Fan-out: group × within-group")}

W, H = 560, 360
M = {"l": 52, "r": 16, "t": 16, "b": 44}


def _x(v: float) -> float:
    return M["l"] + v * (W - M["l"] - M["r"])


def _y(v: float) -> float:
    return H - M["b"] - v * (H - M["t"] - M["b"])


def _axes(xlabel: str, ylabel: str) -> str:
    parts = []
    for t in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
        parts.append(f'<line class="grid" x1="{_x(0)}" x2="{_x(1)}" y1="{_y(t)}" y2="{_y(t)}"/>')
        parts.append(f'<text class="tick" x="{_x(0) - 8}" y="{_y(t) + 4}" text-anchor="end">{t:.0%}</text>')
        parts.append(f'<text class="tick" x="{_x(t)}" y="{_y(0) + 18}" text-anchor="middle">{t:.0%}</text>')
    parts.append(f'<line class="axis" x1="{_x(0)}" x2="{_x(1)}" y1="{_y(0)}" y2="{_y(0)}"/>')
    parts.append(f'<text class="axlabel" x="{_x(0.5)}" y="{H - 6}" text-anchor="middle">{xlabel}</text>')
    parts.append(f'<text class="axlabel" transform="translate(14 {_y(0.5)}) rotate(-90)" text-anchor="middle">{ylabel}</text>')
    return "".join(parts)


def _path(points: list[tuple[float, float]]) -> str:
    return "M" + " L".join(f"{_x(a):.1f},{_y(b):.1f}" for a, b in points)


def reliability_svg(rel: pd.DataFrame) -> str:
    body = [_axes("Jev's stated probability for its pick", "Actual accuracy")]
    body.append(f'<path class="ref" d="{_path([(0, 0), (1, 1)])}"/>')
    body.append(f'<text class="reflabel" x="{_x(0.70)}" y="{_y(0.58)}">perfectly calibrated</text>')
    for strategy, g in rel.groupby("strategy"):
        var, name = SERIES[strategy]
        pts = list(zip(g["mean_p"], g["accuracy"]))
        body.append(f'<path class="line" style="stroke:var({var})" d="{_path(pts)}"/>')
        for _, r in g.iterrows():
            tip = f"{name}\nstated {r.mean_p:.0%} → actual {r.accuracy:.0%}\n{int(r.n)} tickets"
            body.append(f'<circle class="dot" style="fill:var({var})" cx="{_x(r.mean_p):.1f}" cy="{_y(r.accuracy):.1f}" r="5">'
                        f'<title>{html.escape(tip)}</title></circle>')
    return f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Reliability diagram">{"".join(body)}</svg>'


def coverage_svg(curve: pd.DataFrame) -> str:
    body = [_axes("Share of tickets auto-handled (most confident first)", "Accuracy on those tickets")]
    for strategy, g in curve.groupby("strategy"):
        var, name = SERIES[strategy]
        step = max(1, len(g) // 120)
        pts = list(zip(g["coverage"].iloc[::step], g["accuracy"].iloc[::step]))
        pts.append((float(g["coverage"].iloc[-1]), float(g["accuracy"].iloc[-1])))
        body.append(f'<path class="line" style="stroke:var({var})" d="{_path(pts)}"><title>{html.escape(name)}</title></path>')
    return f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Accuracy versus coverage">{"".join(body)}</svg>'


def _legend() -> str:
    return '<div class="legend">' + "".join(
        f'<span><i style="background:var({v})"></i>{html.escape(n)}</span>' for v, n in SERIES.values()
    ) + "</div>"


def _pct(v) -> str:
    return "—" if v is None or pd.isna(v) else f"{v:.1%}"


def render(res: Results, path: str | None = None) -> str:
    path = path or settings.report_path
    p = res.provenance
    s = res.summary.set_index("strategy")
    verified = p["verified_jev"]
    banner = (
        f'<div class="banner ok"><strong>Verified Jev run.</strong> Every decision below came back from '
        f'TypeSafe\'s API, served by {html.escape(", ".join(p["models_served"]))}.</div>'
        if verified else
        '<div class="banner warn"><strong>Synthetic data — not Jev results.</strong> This report was '
        'built from the mock server used to test the pipeline. Run with a real API key '
        '(JEV_MOCK=0) for real findings.</div>'
    )

    tiles = [
        ("Tickets decided", f"{int(p['calls_ok']):,}"),
        ("Questions per call", f"{int(p['questions_per_call'] or 0)}"),
        ("Latency p50 / p95", f"{p['p50_ms']:.0f} / {p['p95_ms']:.0f} ms"),
        ("Total cost", f"${p['cost_usd']:.2f}"),
    ]
    tiles_html = "".join(f'<div class="tile"><div class="k">{k}</div><div class="v">{v}</div></div>' for k, v in tiles)

    strat_rows = "".join(
        f"<tr><td>{html.escape(SERIES[k][1])}</td><td>{int(r.n):,}</td><td>{_pct(r.accuracy)}</td>"
        f"<td>{_pct(r.mean_p)}</td><td>{res.ece.get(k, float('nan')):.3f}</td></tr>"
        for k, r in s.iterrows()
    )
    thr_rows = "".join(
        f"<tr><td>{html.escape(SERIES[r.strategy][1])}</td><td>{r.target:.0%}</td>"
        f"<td>{_pct(r.coverage)}</td><td>{'—' if r.threshold is None or pd.isna(r.threshold) else f'{r.threshold:.3f}'}</td></tr>"
        for r in res.thresholds.itertuples()
    )
    conf_rows = "".join(
        f"<tr><td>{html.escape(SERIES[r.strategy][1].split(':')[0])}</td><td><code>{html.escape(r.actual)}</code></td>"
        f"<td><code>{html.escape(r.predicted)}</code></td><td>{int(r.n)}</td><td>{_pct(r.mean_p)}</td></tr>"
        for r in res.confusions.itertuples()
    )
    rel_rows = "".join(
        f"<tr><td>{html.escape(SERIES[r.strategy][1].split(':')[0])}</td><td>{r.bin / 10:.1f}–{(r.bin + 1) / 10:.1f}</td>"
        f"<td>{int(r.n):,}</td><td>{_pct(r.mean_p)}</td><td>{_pct(r.accuracy)}</td></tr>"
        for r in res.reliability.itertuples()
    )
    prov = {
        "models served (from API response)": ", ".join(p["models_served"]),
        "model requested": settings.jev_model,
        "successful calls / failed": f"{int(p['calls_ok']):,} / {int(p['calls_failed']):,}",
        "calls with x-typesafe-request-id": f"{int(p['with_request_id']):,}",
        "input / output tokens": f"{int(p['input_tokens']):,} / {int(p['output_tokens']):,}",
        "latency p99": f"{p['p99_ms']:.0f} ms",
        "retries": f"{int(p['retries'])}",
        "first / last call (UTC)": f"{p['first_call']} → {p['last_call']}",
        "question version": QUESTION_VERSION,
        "run ids": ", ".join(p["run_ids"]),
        "sample of raw responses": "evidence/jev_responses_sample.jsonl" if verified else "evidence/mock_responses_sample.jsonl",
    }
    prov_rows = "".join(f"<tr><th>{html.escape(k)}</th><td>{html.escape(str(v))}</td></tr>" for k, v in prov.items())

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jev Calibration Report</title>
<style>
:root {{ color-scheme: light; --bg:#fcfcfb; --fg:#0b0b0b; --fg2:#52514e; --line:#e4e3df; --card:#ffffff;
  --s1:#2a78d6; --s2:#eb6834; --okbg:#e8f5ee; --okfg:#0b5c38; --warnbg:#fff3e0; --warnfg:#7a4300; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ color-scheme: dark; --bg:#1a1a19; --fg:#f0efec;
  --fg2:#c3c2b7; --line:#3a3936; --card:#222220; --s1:#3987e5; --s2:#d95926; --okbg:#173326; --okfg:#9be0bb;
  --warnbg:#3a2a12; --warnfg:#ffd18a; }} }}
:root[data-theme="dark"] {{ color-scheme: dark; --bg:#1a1a19; --fg:#f0efec; --fg2:#c3c2b7; --line:#3a3936; --card:#222220;
  --s1:#3987e5; --s2:#d95926; --okbg:#173326; --okfg:#9be0bb; --warnbg:#3a2a12; --warnfg:#ffd18a; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; }}
main {{ max-width: 960px; margin: 0 auto; padding: 32px 16px 64px; }}
h1 {{ font-size: 26px; margin: 0 0 4px; }} h2 {{ font-size: 18px; margin: 36px 0 8px; }}
p.sub {{ color: var(--fg2); margin: 0 0 20px; }}
.banner {{ padding: 12px 14px; border-radius: 8px; margin: 16px 0; }}
.banner.ok {{ background: var(--okbg); color: var(--okfg); }} .banner.warn {{ background: var(--warnbg); color: var(--warnfg); }}
.tiles {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }}
.tile {{ background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }}
.tile .k {{ color: var(--fg2); font-size: 13px; }} .tile .v {{ font-size: 22px; font-weight: 600; }}
.charts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }}
figure {{ margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }}
figcaption {{ font-weight: 600; margin-bottom: 4px; }} figure p {{ color: var(--fg2); font-size: 13px; margin: 0 0 6px; }}
svg {{ width: 100%; height: auto; display: block; }}
.grid {{ stroke: var(--line); stroke-width: 1; }} .axis {{ stroke: var(--fg2); stroke-width: 1; }}
.tick, .axlabel, .reflabel {{ fill: var(--fg2); font-size: 12px; }}
.ref {{ stroke: var(--fg2); stroke-dasharray: 4 4; fill: none; stroke-width: 1; }}
.line {{ fill: none; stroke-width: 2; stroke-linejoin: round; }}
.dot {{ stroke: var(--card); stroke-width: 2; cursor: default; }} .dot:hover {{ r: 7; }}
.legend {{ display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: var(--fg2); margin: 8px 0; }}
.legend i {{ display: inline-block; width: 12px; height: 3px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }}
.tbl {{ overflow-x: auto; }}
table {{ border-collapse: collapse; width: 100%; font-size: 14px; }}
th, td {{ text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }}
thead th {{ color: var(--fg2); font-weight: 600; }} table.kv th {{ color: var(--fg2); font-weight: 500; width: 40%; }}
code {{ font-size: 13px; }} details {{ margin-top: 8px; }} summary {{ cursor: pointer; color: var(--fg2); }}
footer {{ color: var(--fg2); font-size: 13px; margin-top: 40px; }}
</style></head>
<body><main>
<h1>Is Jev calibrated on real banking support tickets?</h1>
<p class="sub">Banking77 test set · Kafka → ClickHouse → Airflow → TypeSafe Jev → ClickHouse ·
generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC</p>
{banner}
<div class="tiles">{tiles_html}</div>

<h2>Two ways to ask the same question</h2>
<div class="tbl"><table><thead><tr><th>Strategy</th><th>Tickets</th><th>Accuracy</th>
<th>Mean stated probability</th><th>ECE (lower is better)</th></tr></thead><tbody>{strat_rows}</tbody></table></div>

<h2>Calibration and routing</h2>
{_legend()}
<div class="charts">
<figure><figcaption>Reliability diagram</figcaption>
<p>Points on the dashed line mean Jev's probabilities can be taken at face value.</p>
{reliability_svg(res.reliability)}</figure>
<figure><figcaption>Accuracy vs. coverage</figcaption>
<p>Auto-handle the most confident tickets first; route the rest to people.</p>
{coverage_svg(res.curve)}</figure>
</div>
<details><summary>Reliability data as a table</summary><div class="tbl"><table><thead><tr><th>Strategy</th>
<th>Probability bin</th><th>Tickets</th><th>Mean stated</th><th>Actual accuracy</th></tr></thead>
<tbody>{rel_rows}</tbody></table></div></details>

<h2>How much can run without a human?</h2>
<div class="tbl"><table><thead><tr><th>Strategy</th><th>Accuracy target</th><th>Share auto-handled</th>
<th>Confidence threshold</th></tr></thead><tbody>{thr_rows}</tbody></table></div>

<h2>Most common mistakes</h2>
<div class="tbl"><table><thead><tr><th>Strategy</th><th>Actual intent</th><th>Jev chose</th><th>Count</th>
<th>Mean stated probability</th></tr></thead><tbody>{conf_rows}</tbody></table></div>

<h2>Provenance</h2>
<p class="sub">Model versions and request IDs come from TypeSafe's responses. Token totals can be
checked against the usage page in the TypeSafe console.</p>
<div class="tbl"><table class="kv"><tbody>{prov_rows}</tbody></table></div>

<footer>Dataset: Banking77 (PolyAI, CC-BY-4.0). Calibration is measured over groups of predictions;
it does not guarantee any single answer.</footer>
</main></body></html>"""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(page)
    with open(os.path.splitext(path)[0] + ".json", "w") as f:
        json.dump({"summary": res.summary.to_dict("records"), "ece": res.ece,
                   "thresholds": res.thresholds.to_dict("records"),
                   "provenance": {k: str(v) for k, v in p.items()}}, f, indent=2, default=str)
    return path
