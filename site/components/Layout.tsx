import { Children, Fragment } from "react";

// Terms that must never break at their hyphen: model names and "fan-out".
const WHOLE = /(jev-\d+\.\d+\.\d+|[Ff]an-out)/;

/** Running text in which model names and "fan-out" never break across lines. */
export function Whole({ children }: { children?: React.ReactNode }) {
  return (
    <>
      {Children.map(children, (c) =>
        typeof c === "string"
          ? c.split(WHOLE).map((part, i) =>
              WHOLE.test(part) ? (
                <span key={i} className="whitespace-nowrap">
                  {part}
                </span>
              ) : (
                <Fragment key={i}>{part}</Fragment>
              ),
            )
          : c,
      )}
    </>
  );
}

/** The page's 12-column grid (single column below 1100px). */
export function Grid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 gap-x-6 wide:grid-cols-12 ${className}`}>{children}</div>;
}

/** A section: one full-width hairline above, then a heading in the main column. */
export function Section({
  id,
  title,
  space = "mt-28",
  children,
}: {
  id: string;
  title: string;
  space?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`${space} scroll-mt-8 border-t border-hairline pt-10`}>
      <Grid>
        <h2 id={`${id}-title`} className="display text-xl wide:col-span-8">
          {title}
        </h2>
      </Grid>
      {children}
    </section>
  );
}

/** A superscript marker that points at its margin note. */
export function Ref({ n }: { n: number }) {
  return (
    <sup className="num ml-0.5 font-sans text-xs">
      <a href={`#note-${n}`} id={`ref-${n}`} aria-label={`Note ${n}`} className="no-underline">
        {n}
      </a>
    </sup>
  );
}

/** A note in the margin column (columns 10 to 12); under its paragraph below 1100px. */
export function Note({ n, children, className = "" }: { n: number; children: React.ReactNode; className?: string }) {
  return (
    <div id={`note-${n}`} role="note" className={`note mt-3 max-w-[66ch] wide:col-span-3 wide:col-start-10 wide:mt-1 ${className}`}>
      <span className="num mr-1 font-sans text-xs not-italic">{n}</span>
      <Whole>{children}</Whole>
    </div>
  );
}

/** A paragraph in the main column with an optional margin note beside it. */
export function Para({ children, note, n, className = "" }: { children: React.ReactNode; note?: React.ReactNode; n?: number; className?: string }) {
  return (
    <Grid className={className}>
      <p className="prose-text wide:col-span-8">
        <Whole>{children}</Whole>
      </p>
      {note && n !== undefined && <Note n={n}>{note}</Note>}
    </Grid>
  );
}

/** "Fig. n." caption set in small Archivo under a figure. */
export function Caption({ n, children, className = "" }: { n: number; children: React.ReactNode; className?: string }) {
  return (
    <figcaption className={`caption mt-4 max-w-[78ch] ${className}`}>
      <span className="font-semibold text-ink">Fig. {n}.</span> <Whole>{children}</Whole>
    </figcaption>
  );
}

/** Lets long identifiers like strategy_decisions break after underscores, never mid-word. */
export function Breakable({ text }: { text: string }) {
  const parts = text.split("_");
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && (
            <>
              _<wbr />
            </>
          )}
        </Fragment>
      ))}
    </>
  );
}
