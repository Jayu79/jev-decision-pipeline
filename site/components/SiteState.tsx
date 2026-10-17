"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Model, Strategy } from "@/lib/types";

/** A ticket someone asked to read, e.g. by clicking a dot in the hero grid. */
export type TicketRequest = { model: Model; strategy: Strategy; ticket: number; nonce: number };

const Ctx = createContext<{ request: TicketRequest | null; openTicket: (m: Model, s: Strategy, t: number) => void }>({
  request: null,
  openTicket: () => {},
});

export function SiteState({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<TicketRequest | null>(null);
  const openTicket = useCallback((model: Model, strategy: Strategy, ticket: number) => {
    setRequest({ model, strategy, ticket, nonce: Date.now() });
  }, []);
  return <Ctx.Provider value={{ request, openTicket }}>{children}</Ctx.Provider>;
}

export const useSiteState = () => useContext(Ctx);
