"use client";

/** A quiet segmented control set as text: the active option is underlined. */
export function TextToggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="no-print flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="mr-1 text-ink-2">{label}</span>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <span key={o.value} className="inline-flex items-baseline gap-x-2 whitespace-nowrap">
            {i > 0 && (
              <span aria-hidden className="text-hairline">
                /
              </span>
            )}
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`py-1.5 underline-offset-[7px] ${
                on
                  ? "font-medium text-ink underline decoration-ink decoration-2"
                  : "text-ink-2 hover:text-ink hover:underline hover:decoration-hairline hover:decoration-1"
              }`}
            >
              {o.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
