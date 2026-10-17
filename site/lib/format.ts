const count = new Intl.NumberFormat("en-US");

export const int = (n: number) => count.format(n);

/** 0.6448 -> "64.5%" */
export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

/** Cutoffs and confidences, always with two decimals: 0.97, 0.80. */
export const cutoff = (x: number) => x.toFixed(2);

const PROPER: Record<string, string> = {
  atm: "ATM", pin: "PIN", apple: "Apple", google: "Google", visa: "Visa", mastercard: "Mastercard",
};

/** card_arrival -> "Card arrival"; Refund_not_showing_up -> "Refund not showing up" */
export function humanize(id: string): string {
  const words = id.replace(/\?$/, "").toLowerCase().split("_").filter(Boolean);
  const text = words.map((w) => PROPER[w] ?? w).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
