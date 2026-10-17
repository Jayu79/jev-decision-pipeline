import { Children, Fragment } from "react";

const split = (text: string) =>
  text.split(/(\d+)/).map((part, i) =>
    /^\d+$/.test(part) ? (
      <span key={i} className="tabular-nums">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );

/**
 * Tabular figures for digits only. Schibsted Grotesk's tabular set also widens
 * commas and periods ("3 , 080"), so punctuation keeps its normal width.
 * Screen readers get the plain text, since some join the digit spans with spaces.
 */
export function N({ children }: { children?: React.ReactNode }) {
  const parts = Children.toArray(children);
  if (!parts.every((c) => typeof c === "string" || typeof c === "number")) return <>{children}</>;
  const text = parts.join("");
  // `relative` keeps the screen-reader copy inside its box (e.g. in a scrolling table).
  return (
    <span className="relative">
      <span aria-hidden className="select-none">
        {split(text)}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
