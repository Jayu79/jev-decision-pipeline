"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { N } from "./N";
import { ModelLabel, Segmented } from "./Segmented";
import { useSiteState } from "./SiteState";
import { cutoff as fmtCutoff, humanize, int, pct } from "@/lib/format";
import { MODELS, STRATEGIES, STRATEGY_LABEL, type Area, type DecisionRow, type Model, type Strategy, type TicketRow } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PAGE = 20;

type Status = "all" | "wrong" | "confident_wrong" | "unsure";
const STATUS: { value: Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "wrong", label: "Wrong" },
  { value: "confident_wrong", label: "Confident and wrong" },
  { value: "unsure", label: "Unsure" },
];
const STATUS_HINT: Record<Status, string> = {
  all: "",
  wrong: "Jev's pick was not the correct intent.",
  confident_wrong: "Confidence 0.9 or higher, and wrong.",
  unsure: "Confidence below 0.6.",
};

// Decision rows by ticket index, cached per model x strategy.
const cache = new Map<string, Promise<DecisionRow[]>>();
let ticketsPromise: Promise<TicketRow[]> | null = null;
const loadTickets = () =>
  (ticketsPromise ??= fetch(`${BASE}/data/tickets.json`).then((r) => r.json()).then((d) => d.rows as TicketRow[]));
function loadDecisions(m: Model, s: Strategy, tickets: TicketRow[]) {
  const key = `${m}_${s}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`${BASE}/data/decisions_${key}.json`)
        .then((r) => r.json())
        .then((d: { rows: DecisionRow[] }) => {
          const byId = new Map(d.rows.map((r) => [r[0], r]));
          return tickets.map((t) => byId.get(t[0]) as DecisionRow);
        }),
    );
  }
  return cache.get(key) as Promise<DecisionRow[]>;
}

export function Explorer({ areas }: { areas: Area[] }) {
  const root = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [wanted, setWanted] = useState(false);
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [decisions, setDecisions] = useState<{ key: string; rows: DecisionRow[] } | null>(null);
  const [model, setModel] = useState<Model>("jev-1.13.0");
  const [strategy, setStrategy] = useState<Strategy>("flat");
  const [area, setArea] = useState("all");
  const [status, setStatus] = useState<Status>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const { request } = useSiteState();

  // Start loading when the section is close to the viewport, or when asked for a ticket.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setWanted(true), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!request) return;
    setWanted(true);
    setModel(request.model);
    setStrategy(request.strategy);
    setArea("all");
    setStatus("all");
    setQuery("");
    setSelected(request.ticket);
  }, [request]);

  useEffect(() => {
    if (wanted) loadTickets().then(setTickets);
  }, [wanted]);

  const key = `${model}_${strategy}`;
  useEffect(() => {
    if (!tickets) return;
    let live = true;
    loadDecisions(model, strategy, tickets).then((rows) => live && setDecisions({ key, rows }));
    return () => {
      live = false;
    };
  }, [tickets, model, strategy, key]);

  const rows = decisions?.key === key ? decisions.rows : null;

  const matches = useMemo(() => {
    if (!tickets || !rows) return [];
    const q = query.trim().toLowerCase();
    const out: number[] = [];
    tickets.forEach((t, i) => {
      const d = rows[i];
      if (area !== "all" && t[3] !== area) return;
      if (status === "wrong" && d[4]) return;
      if (status === "confident_wrong" && (d[4] || d[3] < 0.9)) return;
      if (status === "unsure" && d[3] >= 0.6) return;
      if (q && !t[1].toLowerCase().includes(q)) return;
      out.push(i);
    });
    return out;
  }, [tickets, rows, area, status, query]);

  // Once per hero click, turn to the page holding that ticket.
  const jumped = useRef(0);
  useEffect(() => {
    if (!request || request.nonce === jumped.current || !rows) return;
    const at = matches.indexOf(request.ticket);
    if (at >= 0) {
      setPage(Math.floor(at / PAGE));
      jumped.current = request.nonce;
    }
  }, [matches, request, rows]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = matches.slice(current * PAGE, current * PAGE + PAGE);

  const active = selected ?? matches[0] ?? null;

  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };
  const empty = query.trim()
    ? { text: "No tickets match. Clear the search.", fix: () => reset(() => setQuery("")), button: "Clear the search" }
    : area !== "all"
      ? { text: "No tickets match. Clear the area filter.", fix: () => reset(() => setArea("all")), button: "Clear the area filter" }
      : { text: "No tickets match. Show all tickets.", fix: () => reset(() => setStatus("all")), button: "Show all tickets" };

  return (
    <div ref={root}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:gap-x-10">
          <Segmented
            label="Model"
            value={model}
            onChange={(m) => reset(() => setModel(m))}
            options={MODELS.map((m) => ({ value: m, label: <ModelLabel model={m} /> }))}
          />
          <Segmented
            label="Questions"
            value={strategy}
            onChange={(s) => reset(() => setStrategy(s))}
            options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))}
          />
        </div>
        <Segmented label="Show" value={status} onChange={(s) => reset(() => setStatus(s))} options={STATUS} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex flex-col gap-1 text-sm text-steel sm:w-72">
            Area
            <select
              value={area}
              onChange={(e) => reset(() => setArea(e.target.value))}
              className="min-h-11 rounded-lg border border-rule bg-surface px-3 text-base text-ink"
            >
              <option value="all">{`All ${areas.length} areas`}</option>
              {areas.map((a) => (
                <option key={a.area} value={a.area}>
                  {humanize(a.area)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm text-steel">
            Search messages
            <input
              type="search"
              value={query}
              onChange={(e) => reset(() => setQuery(e.target.value))}
              placeholder="For example: card, refund, exchange rate"
              className="min-h-11 rounded-lg border border-rule bg-surface px-3 text-base text-ink placeholder:text-steel"
            />
          </label>
        </div>
        {STATUS_HINT[status] && <p className="text-sm text-steel">{STATUS_HINT[status]}</p>}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div ref={detailRef} className="scroll-mt-6 lg:sticky lg:top-6 lg:order-2 lg:self-start">
          {tickets && rows && active !== null ? (
            <Detail ticket={tickets[active]} d={rows[active]} areas={areas} model={model} />
          ) : (
            <div className="rounded-xl border border-rule bg-surface p-6 text-steel">
              {tickets && rows ? "Pick a message to see what Jev said." : "Loading tickets…"}
            </div>
          )}
        </div>

        <div className="lg:order-1">
          {tickets && rows && (
            <p className="mb-3 text-sm text-steel" aria-live="polite">
              <N>
                {matches.length
                  ? `${int(matches.length)} tickets. Showing ${int(current * PAGE + 1)} to ${int(current * PAGE + shown.length)}.`
                  : ""}
              </N>
            </p>
          )}
          {tickets && rows && matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-rule p-6">
              <p>{empty.text}</p>
              <button type="button" onClick={empty.fix} className="mt-3 min-h-10 rounded-full border border-ink px-4 text-sm font-medium">
                {empty.button}
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {tickets &&
                rows &&
                shown.map((i) => {
                  const t = tickets[i];
                  const d = rows[i];
                  const on = i === active;
                  return (
                    <li key={t[0]}>
                      <button
                        type="button"
                        aria-current={on || undefined}
                        onClick={() => {
                          setSelected(i);
                          if (window.matchMedia("(max-width: 1023px)").matches) detailRef.current?.scrollIntoView({ block: "start" });
                        }}
                        className={`block w-full px-3 py-3 text-left ${on ? "bg-surface shadow-[inset_3px_0_0_var(--ink)]" : "hover:bg-surface"}`}
                      >
                        <span className="line-clamp-2">{t[1]}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-steel">
                          <Verdict right={!!d[4]} />
                          <span>Jev: {humanize(d[1])}</span>
                          <span><N>confidence {fmtCutoff(d[3])}</N></span>
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
          {pages > 1 && (
            <nav aria-label="Ticket pages" className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                className="min-h-10 rounded-full border border-rule bg-surface px-4 text-sm font-medium disabled:opacity-40"
              >
                Previous page
              </button>
              <span className="text-sm text-steel">
                <N>Page {current + 1} of {pages}</N>
              </span>
              <button
                type="button"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                className="min-h-10 rounded-full border border-rule bg-surface px-4 text-sm font-medium disabled:opacity-40"
              >
                Next page
              </button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

function Verdict({ right }: { right: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
      <span
        aria-hidden
        className={`inline-block size-2.5 rounded-full ${right ? "bg-correct" : "border-2 border-wrong"}`}
      />
      {right ? "Right" : "Wrong"}
    </span>
  );
}

function Detail({ ticket, d, areas, model }: { ticket: TicketRow; d: DecisionRow; areas: Area[]; model: Model }) {
  const [, text, label, area] = ticket;
  const [, intent, pIntent, conf, correct, requestId, top5] = d;
  const areaName = areas.find((a) => a.area === area);
  const inTop = top5.some(([i]) => i === label);
  return (
    <article aria-label="Selected ticket" className="rounded-xl border border-rule bg-surface p-5 sm:p-6">
      <p className="text-sm text-steel">Customer message</p>
      <blockquote className="mt-1 text-lg">&ldquo;{text}&rdquo;</blockquote>

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-steel">Correct intent</dt>
        <dd className="font-medium">
          {humanize(label)} <span className="font-normal text-steel">in {areaName ? humanize(areaName.area) : area}</span>
        </dd>
        <dt className="text-steel">Jev chose</dt>
        <dd className="flex flex-wrap items-center gap-x-3">
          <span className="font-medium">{humanize(intent)}</span>
          <Verdict right={!!correct} />
        </dd>
        <dt className="text-steel">Confidence</dt>
        <dd>
          <N>{fmtCutoff(conf)}</N> <span className="text-steel"><N>(probability {pct(pIntent)})</N></span>
        </dd>
      </dl>

      <h3 className="mt-6 text-base">Jev&apos;s top 5 intents</h3>
      <ul className="mt-3 flex flex-col gap-2.5">
        {top5.map(([i, p]) => {
          const isLabel = i === label;
          return (
            <li key={i} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className={isLabel ? "font-semibold" : ""}>
                  {humanize(i)}
                  {isLabel && <span className="font-normal text-steel"> (correct intent)</span>}
                  {i === intent && !isLabel && <span className="text-steel"> (Jev&apos;s pick)</span>}
                </span>
                <span><N>{pct(p)}</N></span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-rule">
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${Math.max(p * 100, 0.5)}%`, background: isLabel ? "var(--correct)" : "var(--steel)" }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {!inTop && <p className="mt-3 text-sm text-steel">The correct intent is not in Jev&apos;s top 5.</p>}

      <p className="mt-6 text-sm break-all text-steel">
        TypeSafe request ID <code className="text-ink">{requestId}</code>
        <span className="sr-only">, served by {model}</span>
      </p>
    </article>
  );
}
