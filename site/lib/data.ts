// Build-time reads of the exported results (public/data). Server components only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DecisionRow, Hero, Meta, Model, Strategy, Summary } from "./types";

const dir = join(process.cwd(), "public", "data");
const read = <T,>(file: string): T => JSON.parse(readFileSync(join(dir, file), "utf8")) as T;

export const getSummary = () => read<Summary>("summary.json");
export const getMeta = () => read<Meta>("meta.json");
export const getHero = () => read<Hero>("hero.json");
export const getTicketCount = () => read<{ rows: unknown[] }>("tickets.json").rows.length;
export const getDecisions = (m: Model, s: Strategy) =>
  read<{ columns: string[]; rows: DecisionRow[] }>(`decisions_${m}_${s}.json`);
