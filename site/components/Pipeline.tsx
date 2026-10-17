"use client";

import { useState } from "react";
import { N } from "./N";

export type Step = { name: string; detail: string; decision: string; why: string };

export function Pipeline({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(0);
  const s = steps[open];
  return (
    <div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {steps.map((step, i) => {
          const on = i === open;
          return (
            <li key={step.name} className="flex">
              <button
                type="button"
                aria-expanded={on}
                aria-controls="pipeline-step"
                onClick={() => setOpen(i)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left lg:flex-col lg:gap-2 ${
                  on ? "border-ink bg-ink text-paper" : "border-rule bg-surface hover:border-steel"
                }`}
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    on ? "bg-paper text-ink" : "bg-paper text-ink ring-1 ring-rule"
                  }`}
                >
                  <N>{i + 1}</N>
                </span>
                <span>
                  <span className="block font-semibold leading-snug">{step.name}</span>
                  <span className={`mt-0.5 block text-sm leading-snug [overflow-wrap:anywhere] ${on ? "text-paper/80" : "text-steel"}`}><N>{step.detail}</N></span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div id="pipeline-step" role="region" aria-label={`Step ${open + 1}: ${s.name}`} className="mt-4 rounded-xl border border-rule bg-surface p-5 sm:p-6">
        <p className="text-sm text-steel">
          <N>Step {open + 1} of {steps.length}: {s.name}</N>
        </p>
        <h3 className="mt-1 text-lg">{s.decision}</h3>
        <p className="mt-2 max-w-[680px]">{s.why}</p>
      </div>
    </div>
  );
}
