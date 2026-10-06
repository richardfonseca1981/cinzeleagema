import { FormEvent, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { listCountries } from "../../lib/shipping/countries";
import type { AdminShippingSimulation } from "../../types";
import { SIMULATION_MESSAGES, formatBRL, formatDays, formatKg } from "../../lib/shippingAdmin";

const COUNTRIES = listCountries("pt-BR").filter((o) => o.code !== "BR");

// "Testar destino": roda o MESMO cálculo que o comprador vê (país + peso total
// do pedido, embalagem incluída) para o cliente conferir a tabela.
export function SimulationPanel() {
  const [country, setCountry] = useState("US");
  const [weight, setWeight] = useState("500");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<AdminShippingSimulation | null>(null);

  const grams = useMemo(() => (/^\d+$/.test(weight.trim()) ? Number(weight.trim()) : null), [weight]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (grams === null || grams <= 0) return setError("Informe o peso em gramas (número inteiro maior que zero)");
    setLoading(true);
    setError(null);
    try {
      setSimulation(await api.simulateShipping({ country, weightGrams: grams }));
    } catch (err) {
      setSimulation(null);
      setError(err instanceof Error ? err.message : "Não foi possível testar o destino");
    } finally {
      setLoading(false);
    }
  }

  const result = simulation?.result;

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4" data-testid="simulation-panel">
      <h3 className="text-sm font-semibold text-[#1A1A1A]">Testar destino</h3>
      <p className="mt-1 text-xs text-[#64748B]">
        Veja o que o comprador receberia. O peso é o do pedido inteiro, já com a embalagem de 300 g.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-[#1A1A1A]">
          País
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 block rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm">
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[#1A1A1A]">
          Peso total (gramas)
          <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="numeric" className="mt-1 block w-32 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm" />
          <span className="mt-0.5 block text-xs text-[#94A3B8]">{grams && grams > 0 ? `= ${formatKg(grams)}` : " "}</span>
        </label>
        <button type="submit" disabled={loading} className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] hover:bg-[#B37D3F] disabled:opacity-50">
          {loading ? "Testando..." : "Testar"}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-lg bg-[#FEF2F2] px-3 py-2 text-sm text-[#991B1B]" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 text-sm" data-testid="simulation-result" aria-live="polite">
          {result.unavailable ? (
            <p className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[#1A1A1A]">{SIMULATION_MESSAGES[result.unavailable.reason]}</p>
          ) : (
            <ul className="space-y-1.5">
              {result.options.map((option) => (
                <li key={option.id} className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
                  <span>
                    <span className="font-medium text-[#1A1A1A]">{option.service}</span>
                    <span className="ml-2 text-[#64748B]">{formatDays(option.deliveryDaysMin, option.deliveryDaysMax)}</span>
                  </span>
                  <span className="font-semibold text-[#1A1A1A]">{formatBRL(option.priceBRL)}</span>
                </li>
              ))}
            </ul>
          )}
          {result.notice === "taxes_not_included" && (
            <p className="mt-2 text-xs text-[#64748B]">O comprador é avisado: impostos de importação do destino não estão incluídos.</p>
          )}
        </div>
      )}
    </div>
  );
}
