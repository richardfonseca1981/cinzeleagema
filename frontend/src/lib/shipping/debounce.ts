// Debounce simples (usado no recálculo automático depois de mudar o carrinho).
export interface Debouncer {
  schedule(fn: () => void): void;
  cancel(): void;
}

export function createDebouncer(delayMs: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(fn) {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

// Recalcula sozinho só quando o carrinho mudou DEPOIS de já haver uma cotação.
export const AUTO_RECALC_DEBOUNCE_MS = 600;

export function shouldAutoRecalculate(opts: {
  hasQuoted: boolean;
  quotedSignature: string | null;
  currentSignature: string;
  cartIsEmpty: boolean;
}): boolean {
  if (!opts.hasQuoted || opts.cartIsEmpty || opts.quotedSignature === null) return false;
  return opts.quotedSignature !== opts.currentSignature;
}
