import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";

const ExchangeRateContext = createContext<number | null>(null);

// Busca a cotação USD->BRL uma única vez por sessão, só quando o idioma EN é
// usado pela primeira vez (PT nunca precisa dela) — e guarda em memória para
// os demais componentes reaproveitarem via useExchangeRate, sem buscar de
// novo a cada card/página. Se a busca falhar, o valor fica null e
// formatPrice cai de volta para exibir em Real mesmo com idioma EN, em vez
// de quebrar a página.
export function ExchangeRateProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [rate, setRate] = useState<number | null>(null);
  const fetchState = useRef<"idle" | "pending" | "done">("idle");

  useEffect(() => {
    if (i18n.language !== "en" || fetchState.current !== "idle") return;
    fetchState.current = "pending";

    api
      .getExchangeRate()
      .then((data) => {
        setRate(data.rate);
        fetchState.current = "done";
      })
      .catch(() => {
        // Permite tentar de novo numa próxima troca de idioma para EN,
        // em vez de desistir para o resto da sessão.
        fetchState.current = "idle";
      });
  }, [i18n.language]);

  return <ExchangeRateContext.Provider value={rate}>{children}</ExchangeRateContext.Provider>;
}

export function useExchangeRate(): number | null {
  return useContext(ExchangeRateContext);
}
