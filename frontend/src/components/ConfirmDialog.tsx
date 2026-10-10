// Diálogo de confirmação genérico (não-bloqueante): usado quando ativar ou
// salvar uma peça ativa sem nome/preço/foto (ProductForm e ProductList) —
// "Ativar mesmo assim" segue adiante, "Cancelar" só fecha, sem alterar nada.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-[#1A1A1A]">
          {title}
        </h2>
        <p className="mt-3 text-sm text-[#1A1A1A]">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] hover:bg-[#B37D3F]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
