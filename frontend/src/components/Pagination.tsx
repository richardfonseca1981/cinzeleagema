import { getPageItems } from "../lib/pagination";

interface PaginationProps {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

const baseButton =
  "rounded-lg border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40";
const idleButton = "border-[#E2E8F0] bg-white text-[#1A1A1A] hover:bg-[#F8FAFC]";

// Paginação numerada. Em telas ≥ 640 px: Anterior, números com reticências e
// Próxima. Abaixo disso: versão compacta (Anterior, "Página X de Y", Próxima).
// Só renderiza quando há mais de uma página.
export function Pagination({ page, pages, onChange, disabled = false }: PaginationProps) {
  if (pages <= 1) return null;

  const prev = (
    <button type="button" className={`${baseButton} ${idleButton}`} disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>
      Anterior
    </button>
  );
  const next = (
    <button type="button" className={`${baseButton} ${idleButton}`} disabled={disabled || page >= pages} onClick={() => onChange(page + 1)}>
      Próxima
    </button>
  );

  return (
    <nav aria-label="Paginação da lista de produtos">
      {/* Compacta (< 640 px) */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        {prev}
        <span className="text-sm text-[#64748B]">
          Página {page} de {pages}
        </span>
        {next}
      </div>

      {/* Completa (≥ 640 px) */}
      <div className="hidden items-center gap-1 sm:flex">
        {prev}
        {getPageItems(page, pages).map((item) =>
          typeof item === "string" ? (
            <span key={item} aria-hidden="true" className="px-1.5 text-sm text-[#94A3B8]">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => item !== page && onChange(item)}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Página ${item}`}
              className={`${baseButton} min-w-[2.25rem] ${
                item === page ? "border-[#C78F50] bg-[#C78F50] font-semibold text-[#010B1A]" : idleButton
              }`}
            >
              {item}
            </button>
          )
        )}
        {next}
      </div>
    </nav>
  );
}
