import { createContext, ReactNode, useCallback, useContext, useState } from "react";

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

interface ToastContextValue {
  // `action` é opcional (ex.: "Desfazer" depois de mover peças em lote) —
  // toast com ação fica visível mais tempo (ver DURATION_MS abaixo), pra dar
  // tempo real de clicar.
  showToast: (type: ToastType, message: string, action?: ToastAction) => void;
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((type: ToastType, message: string, action?: ToastAction) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message, action }]);
    setTimeout(
      () => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      },
      action ? WITH_ACTION_DURATION_MS : DEFAULT_DURATION_MS
    );
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
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
