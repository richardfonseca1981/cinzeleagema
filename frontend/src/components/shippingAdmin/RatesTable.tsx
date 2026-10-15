import { useState } from "react";
import { api } from "../../lib/api";
import type { AdminShippingRate } from "../../types";
import { emptyRateDraft, formatKg, validateRateDraft, type RateDraft } from "../../lib/shippingAdmin";

interface RatesTableProps {
  zoneId: string;
  rates: AdminShippingRate[];
  // recarrega a lista de zonas depois de salvar/remover
  onChanged: () => Promise<void>;
}

interface Row {
  key: string;
  rateId: string | null; // null = faixa nova, ainda não salva
  draft: RateDraft;
  error: string | null;
  saving: boolean;
  confirmingDelete: boolean;
}

function toDraft(rate: AdminShippingRate): RateDraft {
  return {
    serviceName: rate.serviceName,
    maxWeightG: String(rate.maxWeightG),
    priceBRL: rate.priceBRL.toFixed(2).replace(".", ","),
    deliveryDaysMin: rate.deliveryDaysMin === null ? "" : String(rate.deliveryDaysMin),
    deliveryDaysMax: rate.deliveryDaysMax === null ? "" : String(rate.deliveryDaysMax),
    active: rate.active,
  };
}

function rowsFrom(rates: AdminShippingRate[]): Row[] {
  return rates.map((rate) => ({ key: rate.id, rateId: rate.id, draft: toDraft(rate), error: null, saving: false, confirmingDelete: false }));
}

const cell = "w-full rounded border border-[#E2E8F0] px-2 py-1 text-sm outline-none focus:border-[#C78F50]";

export function RatesTable({ zoneId, rates, onChanged }: RatesTableProps) {
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(rates));
  const [counter, setCounter] = useState(0);

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function patchDraft(key: string, patch: Partial<RateDraft>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, draft: { ...row.draft, ...patch }, error: null } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { key: `new-${counter}`, rateId: null, draft: emptyRateDraft(), error: null, saving: false, confirmingDelete: false }]);
    setCounter((n) => n + 1);
  }

  async function saveRow(row: Row) {
    const checked = validateRateDraft(row.draft);
    if (!checked.ok) return patchRow(row.key, { error: checked.error });
    patchRow(row.key, { saving: true, error: null });
    try {
      if (row.rateId) await api.updateShippingRate(zoneId, row.rateId, checked.payload as unknown as Record<string, unknown>);
      else await api.createShippingRate(zoneId, checked.payload as unknown as Record<string, unknown>);
      await onChanged();
      // a lista recarregada traz o id da faixa nova; reconstrói as linhas
    } catch (err) {
      patchRow(row.key, { saving: false, error: err instanceof Error ? err.message : "Não foi possível salvar a faixa" });
    }
  }

  async function deleteRow(row: Row) {
    if (!row.rateId) return setRows((current) => current.filter((r) => r.key !== row.key));
    patchRow(row.key, { saving: true });
    try {
      await api.deleteShippingRate(zoneId, row.rateId);
      await onChanged();
    } catch (err) {
      patchRow(row.key, { saving: false, confirmingDelete: false, error: err instanceof Error ? err.message : "Não foi possível remover a faixa" });
    }
  }

  return (
    <div className="mt-3" data-testid="rates-table">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
              <th className="min-w-[180px] py-2 pr-2 font-medium">Serviço</th>
              <th className="py-2 pr-2 font-medium">Até quantos gramas</th>
              <th className="py-2 pr-2 font-medium">Preço (R$)</th>
              <th className="py-2 pr-2 font-medium">Prazo mín. (dias)</th>
              <th className="py-2 pr-2 font-medium">Prazo máx. (dias)</th>
              <th className="py-2 pr-2 font-medium">Ativa</th>
              <th className="py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-sm text-[#64748B]">
                  Nenhuma faixa ainda. Sem faixas ativas, o comprador verá "frete a combinar" para os países desta zona.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const grams = Number(row.draft.maxWeightG);
              return (
                <tr key={row.key} className="border-b border-[#F1F5F9] align-top" data-testid="rate-row">
                  <td className="py-2 pr-2">
                    <input aria-label="Serviço" value={row.draft.serviceName} onChange={(e) => patchDraft(row.key, { serviceName: e.target.value })} placeholder="Ex: DHL Express" maxLength={80} className={cell} />
                  </td>
                  <td className="py-2 pr-2">
                    <input aria-label="Até quantos gramas" inputMode="numeric" value={row.draft.maxWeightG} onChange={(e) => patchDraft(row.key, { maxWeightG: e.target.value })} placeholder="1000" className={cell} />
                    <span className="mt-0.5 block text-xs text-[#94A3B8]" data-testid="kg-equivalent">
                      {Number.isFinite(grams) && grams > 0 ? `= ${formatKg(grams)}` : " "}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <input aria-label="Preço em reais" inputMode="decimal" value={row.draft.priceBRL} onChange={(e) => patchDraft(row.key, { priceBRL: e.target.value })} placeholder="120,50" className={cell} />
                  </td>
                  <td className="py-2 pr-2">
                    <input aria-label="Prazo mínimo" inputMode="numeric" value={row.draft.deliveryDaysMin} onChange={(e) => patchDraft(row.key, { deliveryDaysMin: e.target.value })} className={cell} />
                  </td>
                  <td className="py-2 pr-2">
                    <input aria-label="Prazo máximo" inputMode="numeric" value={row.draft.deliveryDaysMax} onChange={(e) => patchDraft(row.key, { deliveryDaysMax: e.target.value })} className={cell} />
                  </td>
                  <td className="py-2 pr-2">
                    <input aria-label="Faixa ativa" type="checkbox" checked={row.draft.active} onChange={(e) => patchDraft(row.key, { active: e.target.checked })} className="h-4 w-4 accent-[#C78F50]" />
                  </td>
                  <td className="py-2">
                    {row.confirmingDelete ? (
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="text-xs text-[#991B1B]">Remover?</span>
                        <button type="button" onClick={() => void deleteRow(row)} disabled={row.saving} className="rounded bg-[#DC2626] px-2 py-1 text-xs font-medium text-white">
                          Sim
                        </button>
                        <button type="button" onClick={() => patchRow(row.key, { confirmingDelete: false })} className="rounded border border-[#E2E8F0] px-2 py-1 text-xs">
                          Não
                        </button>
                      </span>
                    ) : (
                      <span className="flex gap-1">
                        <button type="button" onClick={() => void saveRow(row)} disabled={row.saving} className="rounded bg-[#C78F50] px-2.5 py-1 text-xs font-medium text-[#010B1A] hover:bg-[#B37D3F] disabled:opacity-50">
                          {row.saving ? "..." : "Salvar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => (row.rateId ? patchRow(row.key, { confirmingDelete: true }) : void deleteRow(row))}
                          className="rounded border border-[#E2E8F0] px-2.5 py-1 text-xs text-[#64748B] hover:text-[#DC2626]"
                        >
                          Remover
                        </button>
                      </span>
                    )}
                    {row.error && (
                      <p className="mt-1 max-w-[220px] text-xs text-[#991B1B]" role="alert" data-testid="rate-error">
                        {row.error}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} className="mt-3 rounded-lg border border-[#C78F50] px-3 py-1.5 text-sm font-medium text-[#8A5A1E] hover:bg-[#C78F50]/10">
        + Adicionar faixa
      </button>
    </div>
  );
}
