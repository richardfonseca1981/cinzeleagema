import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { updateConsent } from "./analytics";

// LGPD — Consent Mode v2 (ver lib/analytics.ts initAnalytics: default
// sempre "denied"). Essa escolha só decide se o GA4 pode usar
// cookie/identificador; o script em si já carrega antes disso (ver
// CONTEXT.md "SEO — Rodada 3").
export type ConsentChoice = "granted" | "denied";

interface StoredConsent {
  choice: ConsentChoice;
  timestamp: string;
}

const STORAGE_KEY = "cinzeleagema_consent";

function isConsentChoice(value: unknown): value is ConsentChoice {
  return value === "granted" || value === "denied";
}

function readStoredConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && isConsentChoice(parsed.choice) && typeof parsed.timestamp === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeStoredConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, timestamp: new Date().toISOString() }));
  } catch {
    // localStorage indisponível (modo privado etc.) — a escolha vale só pra sessão atual
  }
}

interface ConsentContextValue {
  // null = ainda sem escolha salva.
  choice: ConsentChoice | null;
  // true quando o banner deve aparecer — sem escolha salva, OU reaberto via
  // "Preferências de cookies" no rodapé (ver Footer.tsx).
  bannerOpen: boolean;
  accept: () => void;
  reject: () => void;
  reopen: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);

  // Roda uma vez, no mount: se já existe uma escolha salva, aplica ela no
  // Consent Mode (sem mostrar o banner); senão, mostra o banner (o default
  // já está "denied" desde o bootstrap em main.tsx, então não precisa
  // nenhuma ação aqui enquanto o visitante não decide).
  useEffect(() => {
    const stored = readStoredConsent();
    if (stored) {
      setChoice(stored.choice);
      updateConsent(stored.choice === "granted");
    } else {
      setBannerOpen(true);
    }
  }, []);

  const decide = useCallback((next: ConsentChoice) => {
    writeStoredConsent(next);
    setChoice(next);
    updateConsent(next === "granted");
    setBannerOpen(false);
  }, []);

  const accept = useCallback(() => decide("granted"), [decide]);
  const reject = useCallback(() => decide("denied"), [decide]);
  const reopen = useCallback(() => setBannerOpen(true), []);

  return <ConsentContext.Provider value={{ choice, bannerOpen, accept, reject, reopen }}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent precisa estar dentro de <ConsentProvider>");
  return ctx;
}
