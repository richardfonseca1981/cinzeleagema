import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";

type ToastType = "success" | "error" | "warning";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

interface ShowToastOptions {
  // Sobrescreve a duração padrão — usado quando o toast protege uma ação em
  // lote grande (ex.: mover várias peças de uma vez): tempo maior dá chance
  // real de clicar em "Desfazer" antes de sumir. Ver ProductCategorization.tsx.
  durationMs?: number;
}

interface ToastContextValue {
  // `action` é opcional (ex.: "Desfazer" depois de mover peças em lote) —
  // toast com ação fica visível mais tempo por padrão (ver
  // WITH_ACTION_DURATION_MS), e `options.durationMs` permite esticar ainda
  // mais quando o próprio chamador sabe que a ação afeta muita coisa.
  showToast: (type: ToastType, message: string, action?: ToastAction, options?: ShowToastOptions) => void;
}

const DEFAULT_DURATION_MS = 4000;
const WITH_ACTION_DURATION_MS = 8000;

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLES: Record<ToastType, string> = {
  success: "border-[#22C55E] bg-[#F0FDF4] text-[#15803D]",
  error: "border-[#EF4444] bg-[#FEF2F2] text-[#B91C1C]",
  warning: "border-[#F59E0B] bg-[#FFFBEB] text-[#B45309]",
};

let nextId = 0;

// Um temporizador por toast — guarda o que falta pra sumir pra poder pausar
// (mouse em cima) e retomar do ponto exato em vez de reiniciar do zero.
interface TimerState {
  timeoutId: ReturnType<typeof setTimeout> | null;
  expiresAt: number;
  remainingMs: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, TimerState>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer?.timeoutId) clearTimeout(timer.timeoutId);
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, ms: number) => {
      const timeoutId = setTimeout(() => dismiss(id), ms);
      timersRef.current.set(id, { timeoutId, expiresAt: Date.now() + ms, remainingMs: ms });
    },
    [dismiss]
  );

  const showToast = useCallback(
    (type: ToastType, message: string, action?: ToastAction, options?: ShowToastOptions) => {
      const id = nextId++;
      const duration = options?.durationMs ?? (action ? WITH_ACTION_DURATION_MS : DEFAULT_DURATION_MS);
      setToasts((prev) => [...prev, { id, type, message, action }]);
      scheduleDismiss(id, duration);
    },
    [scheduleDismiss]
  );

  // Passar o mouse por cima pausa a contagem — sem isso, mirar o clique no
  // "Desfazer" de uma movimentação grande podia perder a janela de tempo bem
  // na hora de decidir.
  function pause(id: number) {
    const timer = timersRef.current.get(id);
    if (!timer || timer.timeoutId === null) return;
    clearTimeout(timer.timeoutId);
    timersRef.current.set(id, { timeoutId: null, expiresAt: timer.expiresAt, remainingMs: Math.max(timer.expiresAt - Date.now(), 0) });
  }

  function resume(id: number) {
    const timer = timersRef.current.get(id);
    if (!timer || timer.timeoutId !== null) return;
    scheduleDismiss(id, timer.remainingMs);
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* bottom-20 no celular: deixa espaço pra uma eventual barra de ação
          fixa no rodapé (ex.: tela de categorização) não ficar embaixo do
          toast; sm: volta ao canto inferior normal. */}
      <div className="fixed inset-x-4 bottom-20 z-50 flex flex-col gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onMouseEnter={() => pause(toast.id)}
            onMouseLeave={() => resume(toast.id)}
            className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-md ${TOAST_STYLES[toast.type]}`}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  dismiss(toast.id);
                }}
                className="flex-shrink-0 font-semibold underline underline-offset-2"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de ToastProvider");
  return ctx;
}
