"use client";

import { N } from "./N";

/** A row of mutually exclusive buttons. Selection is shown by fill and aria-pressed. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="w-full text-sm text-steel sm:mr-1 sm:w-auto">{label}</span>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium ${
              on ? "border-ink bg-ink text-paper" : "border-rule bg-surface text-ink hover:border-steel"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Model name with its comparison color, shown as a swatch next to the text. */
export function ModelLabel({ model }: { model: string }) {
  const color = model === "jev-1.14.0" ? "var(--m114)" : "var(--m113)";
  const square = model === "jev-1.14.0";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden
        className="inline-block size-2.5 border border-current/20"
        style={{ background: color, borderRadius: square ? 2 : 9999 }}
      />
      <N>{model}</N>
    </span>
  );
}
