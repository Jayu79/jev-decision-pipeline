"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Caption } from "./Layout";
import { useSiteState } from "./SiteState";
import { TextToggle } from "./TextToggle";
import { cutoff as fmtCutoff, humanize, int, pct } from "@/lib/format";
import { MODELS, STRATEGIES, STRATEGY_LABEL, type Area, type DecisionRow, type Model, type Strategy, type TicketRow } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PAGE = 12;
/** Intents below this probability are left out of the specimen's list. */
const MIN_SHOWN = 0.005;

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

/** Fig. 4: every ticket, filterable, with one shown as a specimen. */
export function Explorer({ areas }: { areas: Area[] }) {
  const root = useRef<HTMLDivElement>(null);
  const specimenRef = useRef<HTMLDivElement>(null);
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

  // Start loading when the figure is close to the viewport, or when asked for a ticket.
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
  const ready = !!(tickets && rows);

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
    <figure ref={root} className="mt-10">
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 lg:grid-cols-12 lg:gap-y-0">
        {/* Left pane, top: filters. */}
        <div className="lg:col-span-6 lg:col-start-1 lg:row-start-1">
          <div className="no-print flex flex-col gap-1">
            <TextToggle label="Model" value={model} onChange={(m) => reset(() => setModel(m))} options={MODELS.map((m) => ({ value: m, label: m }))} />
            <TextToggle
              label="Questions"
              value={strategy}
              onChange={(s) => reset(() => setStrategy(s))}
              options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))}
            />
            <TextToggle label="Show" value={status} onChange={(s) => reset(() => setStatus(s))} options={STATUS} />
            <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <label className="flex flex-col text-xs text-ink-2">
                Area
                <select
                  value={area}
                  onChange={(e) => reset(() => setArea(e.target.value))}
                  className="mt-1 h-9 appearance-none rounded-none border-0 border-b border-ink bg-transparent bg-[length:10px_6px] bg-[right_2px_center] bg-no-repeat pr-6 text-sm text-ink"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6' fill='none' stroke='%231d2124'/%3E%3C/svg%3E\")",
                  }}
                >
                  <option value="all">{`All ${areas.length} areas`}</option>
                  {areas.map((a) => (
                    <option key={a.area} value={a.area}>
                      {humanize(a.area)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs text-ink-2">
                Search messages
                <input
                  type="search"
                  value={query}
                  onChange={(e) => reset(() => setQuery(e.target.value))}
                  placeholder="card, refund, exchange rate"
                  className="mt-1 h-9 rounded-none border-0 border-b border-ink bg-transparent text-sm text-ink placeholder:text-ink-2"
                />
              </label>
            </div>
            {STATUS_HINT[status] && <p className="mt-3 text-xs text-ink-2">{STATUS_HINT[status]}</p>}
          </div>

        </div>

        {/* Right pane: the specimen. */}
        <div ref={specimenRef} className="scroll-mt-8 lg:sticky lg:top-8 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:self-start">
          {ready && active !== null ? (
            <Specimen ticket={tickets![active]} d={rows![active]} areas={areas} />
          ) : (
            <p className="border-t border-ink pt-3 text-xs text-ink-2">{ready ? "Pick a message to inspect it." : "Loading tickets…"}</p>
          )}
        </div>
        {/* Left pane, below: the list. */}
        <div className="lg:col-span-6 lg:col-start-1 lg:row-start-2">
          <p className="num mt-8 border-b border-ink pb-2 text-xs text-ink-2" aria-live="polite">
            {ready
              ? matches.length
                ? `${int(matches.length)} tickets. Showing ${int(current * PAGE + 1)} to ${int(current * PAGE + shown.length)}.`
                : "0 tickets."
              : "Loading tickets…"}
          </p>
          {ready && matches.length === 0 ? (
            <div className="py-6">
              <p className="prose-text">{empty.text}</p>
              <button type="button" onClick={empty.fix} className="mt-2 text-sm underline decoration-hairline underline-offset-4 hover:decoration-ink">
                {empty.button}
              </button>
            </div>
          ) : (
            <ul>
              {ready &&
                shown.map((i) => {
                  const t = tickets![i];
                  const d = rows![i];
                  const on = i === active;
                  return (
                    <li key={t[0]} className="border-b border-hairline">
                      <button
                        type="button"
                        aria-current={on || undefined}
                        onClick={() => {
                          setSelected(i);
                          if (window.matchMedia("(max-width: 1023px)").matches) specimenRef.current?.scrollIntoView({ block: "start" });
                        }}
                        className={`group block w-full border-l-2 py-3 pr-2 pl-4 text-left ${on ? "border-ink" : "border-transparent"}`}
                      >
                        <span className={`line-clamp-2 font-serif text-base leading-snug ${on ? "" : "group-hover:underline group-hover:decoration-hairline"}`}>
                          {t[1]}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-ink-2">
                          <Verdict right={!!d[4]} />
                          <span>Jev: {humanize(d[1])}</span>
                          <span className="num">confidence {fmtCutoff(d[3])}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
          {pages > 1 && (
            <nav aria-label="Ticket pages" className="no-print mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
              <button
                type="button"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                className="underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:text-ink-2 disabled:no-underline"
              >
                Previous page
              </button>
              <span className="num text-xs text-ink-2">
                Page {current + 1} of {pages}
              </span>
              <button
                type="button"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                className="underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:text-ink-2 disabled:no-underline"
              >
                Next page
              </button>
            </nav>
          )}
        </div>

      </div>
      <Caption n={4}>
        Every ticket Jev saw. Pick one from the list to inspect it: the customer&apos;s message, the correct intent,
        Jev&apos;s most likely intents with their probabilities (any of its top five at 0.5% or more), and the request ID
        TypeSafe returned for that call.
      </Caption>
    </figure>
  );
}

function Verdict({ right }: { right: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink">
      <svg width="9" height="9" aria-hidden>
        {right ? (
          <circle cx="4.5" cy="4.5" r="3.5" fill="var(--ink)" />
        ) : (
          <circle cx="4.5" cy="4.5" r="3.4" fill="none" stroke="var(--wrong)" strokeWidth="1.6" />
        )}
      </svg>
      {right ? "Right" : "Wrong"}
    </span>
  );
}

function Specimen({ ticket, d, areas }: { ticket: TicketRow; d: DecisionRow; areas: Area[] }) {
  const [eventId, text, label, area] = ticket;
  const [, intent, pIntent, conf, correct, requestId, top5] = d;
  const areaName = areas.find((a) => a.area === area);
  const listed = top5.filter(([, p]) => p >= MIN_SHOWN);
  const labelRank = top5.findIndex(([i]) => i === label);
  return (
    <article aria-label="Selected ticket" className="border-t border-ink pt-3">
      <p className="num text-xs text-ink-2">Ticket {eventId}</p>
      <blockquote className="mt-4 font-serif text-lg leading-snug [hanging-punctuation:first]">&ldquo;{text}&rdquo;</blockquote>

      <dl className="mt-6 grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2 border-t border-hairline pt-4 text-sm">
        <dt className="text-ink-2">Correct intent</dt>
        <dd>
          {humanize(label)} <span className="text-ink-2">in {areaName ? humanize(areaName.area) : area}</span>
        </dd>
        <dt className="text-ink-2">Jev chose</dt>
        <dd className="flex flex-wrap items-center gap-x-3">
          {humanize(intent)}
          <Verdict right={!!correct} />
        </dd>
        <dt className="text-ink-2">Confidence</dt>
        <dd className="num">
          {fmtCutoff(conf)} <span className="text-ink-2">(probability {pct(pIntent)})</span>
        </dd>
      </dl>

      <h3 className="mt-8 text-sm font-semibold">Jev&apos;s most likely intents</h3>
      <ul className="mt-3">
        {listed.map(([i, p]) => {
          const isLabel = i === label;
          const isPick = i === intent;
          return (
            <li key={i} className="py-2">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={isLabel ? "font-semibold" : ""}>
                  {humanize(i)}
                  {isLabel && <span className="font-normal text-ink-2"> (correct intent)</span>}
                  {isPick && !isLabel && <span className="text-ink-2"> (Jev&apos;s pick)</span>}
                </span>
              </div>
              {/* A fine measurement bar on a ruled track, value at its end. */}
              <div className="mt-1.5 flex items-center gap-3">
                <svg className="h-3 flex-1 overflow-visible" aria-hidden>
                  <line x1="0" x2="100%" y1="6" y2="6" stroke="var(--hairline)" />
                  {[0, 25, 50, 75, 100].map((t) => (
                    <line key={t} x1={`${t}%`} x2={`${t}%`} y1="3" y2="9" stroke="var(--hairline)" />
                  ))}
                  <rect x="0" y="4.5" width={`${Math.max(p * 100, 0.4)}%`} height="3" fill={isLabel ? "var(--ink)" : "var(--ink-2)"} />
                </svg>
                <span className="num w-14 text-right text-xs">{pct(p)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {listed.length < top5.length && <p className="mt-2 text-xs text-ink-2">Every other intent: under 0.5%</p>}
      {labelRank === -1 && <p className="mt-1 text-xs text-ink-2">The correct intent is not among Jev&apos;s five most likely.</p>}
      {labelRank >= 0 && top5[labelRank][1] < MIN_SHOWN && (
        <p className="mt-1 text-xs text-ink-2">The correct intent, {humanize(label)}, is among them, under 0.5%.</p>
      )}

      <p className="mt-6 border-t border-hairline pt-3 text-xs break-all text-ink-2">
        TypeSafe request ID <span className="num text-ink">{requestId}</span>
      </p>
    </article>
  );
}
