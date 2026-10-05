import type { ShippingErrorKind } from "./errors";
import type { ShippingQuoteResult } from "./types";

// Estado da cotação. Cada requisição tem um id; respostas de requisições
// antigas (que chegam depois de uma nova ter começado) são DESCARTADAS.
export type QuoteState =
  | { status: "idle" }
  | { status: "loading"; requestId: number }
  | { status: "success"; requestId: number; result: ShippingQuoteResult; signature: string }
  | { status: "error"; requestId: number; error: ShippingErrorKind };

export type QuoteAction =
  | { type: "request"; requestId: number }
  | { type: "success"; requestId: number; result: ShippingQuoteResult; signature: string }
  | { type: "failure"; requestId: number; error: ShippingErrorKind }
  | { type: "restore"; result: ShippingQuoteResult; signature: string }
  | { type: "reset" };

export const INITIAL_QUOTE_STATE: QuoteState = { status: "idle" };

export function quoteReducer(state: QuoteState, action: QuoteAction): QuoteState {
  switch (action.type) {
    case "request":
      return { status: "loading", requestId: action.requestId };
    case "success":
      if (state.status !== "loading" || state.requestId !== action.requestId) return state; // atrasada
      return { status: "success", requestId: action.requestId, result: action.result, signature: action.signature };
    case "failure":
      if (state.status !== "loading" || state.requestId !== action.requestId) return state; // atrasada
      return { status: "error", requestId: action.requestId, error: action.error };
    case "restore":
      return { status: "success", requestId: 0, result: action.result, signature: action.signature };
    case "reset":
      return INITIAL_QUOTE_STATE;
  }
}
