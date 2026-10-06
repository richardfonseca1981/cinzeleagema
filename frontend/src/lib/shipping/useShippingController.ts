import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { CartItem } from "../../types";
import { cartSignature } from "./cartSignature";
import { DEFAULT_COUNTRY, listCountries } from "./countries";
import { AUTO_RECALC_DEBOUNCE_MS, createDebouncer, shouldAutoRecalculate } from "./debounce";
import {
  QUOTE_TIMEOUT_MS,
  RATE_LIMIT_COOLDOWN_MS,
  ShippingTimeoutError,
  classifyShippingError,
  issueFromError,
  issueFromUnavailableReason,
  type ShippingIssue,
} from "./errors";
import { cheapestOption, pickBadges, selectionAfterQuote } from "./options";
import {
  digitsOnly,
  isCompleteBrazilianPostalCode,
  maskBrazilianPostalCode,
  sanitizeForeignPostalCode,
} from "./postalCode";
import { INITIAL_QUOTE_STATE, quoteReducer } from "./quoteState";
import {
  QUOTE_CACHE_TTL_MS,
  emptyStoredShipping,
  isQuoteValid,
  loadStoredShipping,
  saveStoredShipping,
  type StoredArrangeChoice,
  type StoredShipping,
} from "./storage";
import { resolveShippingSummary } from "./summary";
import type { ShippingQuoteResult } from "./types";

// Estado da calculadora de frete da página do carrinho: destino, cotação
// (com descarte de respostas atrasadas), escolha, cooldown de 429, recálculo
// automático e persistência. Os cálculos de regra são funções puras nos
// outros arquivos desta pasta.
//
// Frete DEFINITIVO: o valor cotado vale como final por 10 minutos. Não há
// caminho para "pular" o cálculo: o frete é "a combinar" só nos casos de
// over_limits / país sem tarifa / dados incompletos (automático) ou quando o
// comprador escolhe explicitamente fechar com frete a combinar depois de uma
// falha técnica (chooseArrange).

const lookupCache = new Map<string, { city: string | null; state: string | null }>();

interface Place {
  city: string | null;
  state: string | null;
}

export function useShippingController(items: CartItem[]) {
  const { i18n } = useTranslation();
  const signature = useMemo(() => cartSignature(items), [items]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  // Estado inicial vindo do localStorage (uma vez).
  const initial = useMemo(() => {
    const stored = loadStoredShipping() ?? emptyStoredShipping();
    const now = Date.now();
    const quoteValid = isQuoteValid(stored.quote, signature, now);
    const cartChanged = Boolean(stored.quote) && stored.quote!.signature !== signature;
    // a escolha de "a combinar" só vale para o mesmo carrinho
    const arrangeChoice = stored.arrangeChoice?.signature === signature ? stored.arrangeChoice : null;
    return { stored, quoteValid, cartChanged, arrangeChoice, expiredByTime: Boolean(stored.quote) && !quoteValid && !cartChanged };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [country, setCountryState] = useState(initial.stored.country || DEFAULT_COUNTRY);
  const [postal, setPostalState] = useState(
    initial.stored.country === "BR" ? maskBrazilianPostalCode(initial.stored.postalCode) : initial.stored.postalCode
  );
  const [place, setPlace] = useState<Place | null>(
    initial.stored.city ? { city: initial.stored.city, state: initial.stored.state } : null
  );
  const [quoteState, dispatch] = useReducer(
    quoteReducer,
    initial.quoteValid && initial.stored.quote
      ? { status: "success" as const, requestId: 0, result: initial.stored.quote.result, signature: initial.stored.quote.signature }
      : INITIAL_QUOTE_STATE
  );
  const [selection, setSelection] = useState<string | null>(initial.quoteValid ? initial.stored.selection : null);
  const [arrangeChoice, setArrangeChoice] = useState<StoredArrangeChoice | null>(initial.arrangeChoice);
  const [hasQuoted, setHasQuoted] = useState(Boolean(initial.stored.quote));
  // assinatura do carrinho da última cotação pedida/recebida (para o recálculo automático)
  const [quotedSignature, setQuotedSignature] = useState<string | null>(initial.stored.quote?.signature ?? null);
  const [postalError, setPostalError] = useState(false);
  const [expiredNotice, setExpiredNotice] = useState(initial.expiredByTime);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const savedAtRef = useRef(initial.stored.quote?.savedAt ?? Date.now());

  const countries = useMemo(() => listCountries(i18n.language), [i18n.language]);
  const isBrazil = country === DEFAULT_COUNTRY;
  const postalValue = isBrazil ? digitsOnly(postal) : postal.trim();

  // --- destino -------------------------------------------------------------
  const invalidateQuote = useCallback(() => {
    abortRef.current?.abort();
    idRef.current += 1;
    dispatch({ type: "reset" });
    setSelection(null);
    setArrangeChoice(null);
    setHasQuoted(false);
    setQuotedSignature(null);
    setExpiredNotice(false);
  }, []);

  const setCountry = useCallback(
    (code: string) => {
      if (code === country) return;
      setCountryState(code);
      setPostalState("");
      setPlace(null);
      setPostalError(false);
      invalidateQuote();
    },
    [country, invalidateQuote]
  );

  const setPostal = useCallback(
    (raw: string) => {
      const next = isBrazil ? maskBrazilianPostalCode(raw) : sanitizeForeignPostalCode(raw);
      if (next === postal) return;
      setPostalState(next);
      setPostalError(false);
      invalidateQuote();
    },
    [isBrazil, postal, invalidateQuote]
  );

  // Nome da cidade pelo CEP (só Brasil, só com 8 dígitos). Falha = sem nome, sem erro.
  useEffect(() => {
    if (!isBrazil || !isCompleteBrazilianPostalCode(postal)) {
      if (!isBrazil || digitsOnly(postal).length < 8) setPlace(null);
      return;
    }
    const code = digitsOnly(postal);
    const cached = lookupCache.get(code);
    if (cached) {
      setPlace(cached);
      return;
    }
    const controller = new AbortController();
    api
      .lookupPostalCode(code, controller.signal)
      .then((res) => {
        const found = { city: res.city, state: res.state };
        lookupCache.set(code, found);
        setPlace(found.city ? found : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPlace(null);
      });
    return () => controller.abort();
  }, [isBrazil, postal]);

  // --- cotação ---------------------------------------------------------------
  const calculate = useCallback(async () => {
    if (itemsRef.current.length === 0) return;
    if (isBrazil && !isCompleteBrazilianPostalCode(postal)) {
      setPostalError(true);
      return;
    }
    if (Date.now() < cooldownUntil) return;

    const currentSignature = signatureRef.current;
    setPostalError(false);
    setExpiredNotice(false);
    setArrangeChoice(null); // nova cotação: a escolha anterior de "a combinar" não vale mais
    setHasQuoted(true);
    setQuotedSignature(currentSignature);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++idRef.current;
    dispatch({ type: "request", requestId });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, QUOTE_TIMEOUT_MS);

    try {
      const result: ShippingQuoteResult = await api.getShippingQuote(
        {
          country,
          ...(postalValue ? { postalCode: postalValue } : {}),
          items: itemsRef.current.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        },
        controller.signal
      );
      if (requestId !== idRef.current) return; // resposta atrasada de uma requisição antiga
      savedAtRef.current = Date.now();
      dispatch({ type: "success", requestId, result, signature: currentSignature });
      setSelection((previous) => selectionAfterQuote(result, previous));
      if (isBrazil && result.destination.city) setPlace({ city: result.destination.city, state: result.destination.state });
    } catch (err) {
      if (requestId !== idRef.current) return;
      const error = timedOut ? classifyShippingError(new ShippingTimeoutError()) : classifyShippingError(err);
      dispatch({ type: "failure", requestId, error });
      if (error === "rate_limited") setCooldownUntil(Date.now() + RATE_LIMIT_COOLDOWN_MS);
      if (error === "invalid_postal_code") setPostalError(true);
    } finally {
      clearTimeout(timer);
    }
  }, [country, isBrazil, postal, postalValue, cooldownUntil]);

  const calculateRef = useRef(calculate);
  calculateRef.current = calculate;

  // Recálculo automático: só quando o carrinho mudou DEPOIS de já haver
  // cotação, com debounce de 600 ms.
  useEffect(() => {
    if (!shouldAutoRecalculate({ hasQuoted, quotedSignature, currentSignature: signature, cartIsEmpty: items.length === 0 })) return;
    const debouncer = createDebouncer(AUTO_RECALC_DEBOUNCE_MS);
    debouncer.schedule(() => void calculateRef.current());
    return () => debouncer.cancel();
  }, [signature, hasQuoted, quotedSignature, items.length]);

  // Contagem regressiva do cooldown de 429.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    setNow(Date.now());
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= cooldownUntil) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // --- escolha ---------------------------------------------------------------
  const selectOption = useCallback((id: string) => setSelection(id), []);

  // --- persistência + resumo -------------------------------------------------
  const result = quoteState.status === "success" ? quoteState.result : null;

  // Falha técnica atual (se houver): vem da cotação que acabou de falhar ou de
  // uma resposta "indisponível" por problema técnico. Não é persistida.
  const issue: ShippingIssue | null = useMemo(() => {
    if (quoteState.status === "error") return issueFromError(quoteState.error);
    if (quoteState.status === "success" && quoteState.result.unavailable) {
      return issueFromUnavailableReason(quoteState.result.unavailable.reason);
    }
    return null;
  }, [quoteState]);

  // "Fechar o pedido com frete a combinar": escolha explícita, só depois de uma
  // falha técnica que o comprador viu. Devolve false se não há falha para escolher.
  const chooseArrange = useCallback((): boolean => {
    if (!issue || issue.type !== "technical") return false;
    setArrangeChoice({ signature: signatureRef.current, cause: issue.cause, chosenAt: Date.now() });
    return true;
  }, [issue]);

  const stored: StoredShipping = useMemo(
    () => ({
      version: 2,
      country,
      postalCode: postalValue,
      city: place?.city ?? null,
      state: place?.state ?? null,
      quote:
        quoteState.status === "success"
          ? { result: quoteState.result, signature: quoteState.signature, savedAt: savedAtRef.current }
          : null,
      selection,
      arrangeChoice,
    }),
    [country, postalValue, place, quoteState, selection, arrangeChoice]
  );

  useEffect(() => {
    saveStoredShipping(stored);
  }, [stored]);

  // Quando a cotação completa 10 minutos, renderiza de novo para o resumo
  // passar a avisar que o valor será conferido ao confirmar.
  const [, setExpiryTick] = useState(0);
  const quoteSavedAt = quoteState.status === "success" ? savedAtRef.current : null;
  useEffect(() => {
    if (quoteSavedAt === null) return;
    const remaining = quoteSavedAt + QUOTE_CACHE_TTL_MS - Date.now();
    if (remaining <= 0) return;
    const id = setTimeout(() => setExpiryTick((n) => n + 1), remaining + 50);
    return () => clearTimeout(id);
  }, [quoteSavedAt]);

  // Relógio no momento da renderização (e NÃO o estado `now`, que só anda
  // durante o cooldown e deixaria uma cotação recém-chegada parecer "do futuro").
  const summary = resolveShippingSummary(stored, signature, Date.now());
  const quoteIsCurrent = quoteState.status !== "success" || quoteState.signature === signature;
  const cooldownSecondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const badges = useMemo(() => (result ? pickBadges(result.options) : { cheapestId: null, fastestId: null }), [result]);
  const cheapest = useMemo(() => (result ? cheapestOption(result.options) : null), [result]);

  return {
    country,
    setCountry,
    countries,
    isBrazil,
    postal,
    setPostal,
    place,
    postalError,
    quoteState,
    result,
    badges,
    cheapestId: cheapest?.id ?? null,
    selection,
    selectOption,
    issue,
    chooseArrange,
    calculate,
    isLoading: quoteState.status === "loading",
    cooldownSecondsLeft,
    expiredNotice,
    cartChangedSinceQuote: !quoteIsCurrent,
    stored,
    summary,
  };
}

export type ShippingController = ReturnType<typeof useShippingController>;
