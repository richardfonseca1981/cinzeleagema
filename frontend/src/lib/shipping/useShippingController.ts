import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { CartItem } from "../../types";
import { cartSignature } from "./cartSignature";
import { DEFAULT_COUNTRY, listCountries } from "./countries";
import { AUTO_RECALC_DEBOUNCE_MS, createDebouncer, shouldAutoRecalculate } from "./debounce";
import { QUOTE_TIMEOUT_MS, RATE_LIMIT_COOLDOWN_MS, ShippingTimeoutError, classifyShippingError } from "./errors";
import { cheapestOption, pickBadges, selectionAfterQuote } from "./options";
import {
  digitsOnly,
  isCompleteBrazilianPostalCode,
  maskBrazilianPostalCode,
  sanitizeForeignPostalCode,
} from "./postalCode";
import { INITIAL_QUOTE_STATE, quoteReducer } from "./quoteState";
import {
  emptyStoredShipping,
  isQuoteValid,
  loadStoredShipping,
  saveStoredShipping,
  type StoredShipping,
} from "./storage";
import { resolveShippingSummary } from "./summary";
import { ARRANGE_OPTION_ID, type ShippingQuoteResult } from "./types";

// Estado da calculadora de frete da página do carrinho: destino, cotação
// (com descarte de respostas atrasadas), escolha, cooldown de 429, recálculo
// automático e persistência. Os cálculos de regra são funções puras nos
// outros arquivos desta pasta.

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
    return { stored, quoteValid, cartChanged, expiredByTime: Boolean(stored.quote) && !quoteValid && !cartChanged };
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
  const [selection, setSelection] = useState<string | null>(
    initial.stored.selection === ARRANGE_OPTION_ID || initial.quoteValid ? initial.stored.selection : null
  );
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
  const chooseArrange = useCallback(() => setSelection(ARRANGE_OPTION_ID), []);

  // --- persistência + resumo -------------------------------------------------
  const result = quoteState.status === "success" ? quoteState.result : null;

  const stored: StoredShipping = useMemo(
    () => ({
      version: 1,
      country,
      postalCode: postalValue,
      city: place?.city ?? null,
      state: place?.state ?? null,
      quote:
        quoteState.status === "success"
          ? { result: quoteState.result, signature: quoteState.signature, savedAt: savedAtRef.current }
          : null,
      selection,
    }),
    [country, postalValue, place, quoteState, selection]
  );

  useEffect(() => {
    saveStoredShipping(stored);
  }, [stored]);

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
