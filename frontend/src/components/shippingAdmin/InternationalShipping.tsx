import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { countryName } from "../../lib/shipping/countries";
import { sortSelected } from "../../lib/shippingAdmin";
import { listCountries } from "../../lib/shipping/countries";
import type { AdminShippingZone } from "../../types";
import { RatesTable } from "./RatesTable";
import { SimulationPanel } from "./SimulationPanel";
import { ZoneForm, type ZoneFormValues } from "./ZoneForm";

const COUNTRY_OPTIONS = listCountries("pt-BR");

type Editing = { mode: "new" } | { mode: "edit"; zoneId: string } | null;

export function InternationalShipping({ onChanged }: { onChanged?: () => void }) {
  const [zones, setZones] = useState<AdminShippingZone[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [openRates, setOpenRates] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setZones(await api.listShippingZones());
      setLoadError(false);
      onChanged?.();
    } catch {
      setLoadError(true);
    }
  }, [onChanged]);

  useEffect(() => {
    void load();
    // só no primeiro carregamento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveZone(values: ZoneFormValues) {
    setSaving(true);
    setFormError(null);
    try {
      if (editing?.mode === "edit") await api.updateShippingZone(editing.zoneId, values);
      else await api.createShippingZone(values);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar a zona");
    } finally {
      setSaving(false);
    }
  }

  async function removeZone(id: string) {
    setActionError(null);
    try {
      await api.deleteShippingZone(id);
      setConfirmDelete(null);
      if (openRates === id) setOpenRates(null);
      await load();
    } catch (err) {
      setConfirmDelete(null);
      setActionError(err instanceof Error ? err.message : "Não foi possível remover a zona");
    }
  }

  const editingZone = editing?.mode === "edit" ? zones?.find((z) => z.id === editing.zoneId) : undefined;

  return (
    <section className="rounded-lg border border-[#E2E8F0] bg-white p-6" data-testid="international-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-sm font-semibold text-[#1A1A1A]">Frete internacional</h2>
          <p className="max-w-2xl text-xs text-[#64748B]">
            O valor da tabela aparece como definitivo para o comprador. Impostos de importação do destino não estão incluídos e o
            comprador é avisado. País sem tarifa: frete a combinar.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setEditing({ mode: "new" });
            }}
            className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F]"
          >
            Nova zona
          </button>
        )}
      </div>

      {actionError && (
        <p className="mt-3 rounded-lg bg-[#FEF2F2] px-3 py-2 text-sm text-[#991B1B]" role="alert">
          {actionError}
        </p>
      )}

      {editing?.mode === "new" && (
        <div className="mt-4">
          <ZoneForm
            title="Nova zona"
            initial={{ name: "", countries: [], active: true }}
            saving={saving}
            error={formError}
            onSubmit={saveZone}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loadError && <p className="text-sm text-[#991B1B]">Não foi possível carregar as zonas de frete.</p>}
        {zones === null && !loadError && <p className="text-sm text-[#64748B]">Carregando...</p>}
        {zones?.length === 0 && !editing && (
          <p className="rounded-lg border border-dashed border-[#E2E8F0] p-4 text-sm text-[#64748B]" data-testid="no-zones">
            Nenhuma zona cadastrada. Sem zonas, todo país fora do Brasil fica com frete a combinar.
          </p>
        )}

        {zones?.map((zone) => {
          const isEditing = editing?.mode === "edit" && editing.zoneId === zone.id;
          if (isEditing && editingZone) {
            return (
              <ZoneForm
                key={zone.id}
                title={`Editar zona: ${zone.name}`}
                initial={{ name: zone.name, countries: zone.countries, active: zone.active }}
                saving={saving}
                error={formError}
                onSubmit={saveZone}
                onCancel={() => setEditing(null)}
              />
            );
          }
          const names = sortSelected(zone.countries, COUNTRY_OPTIONS).map((c) => countryName(c.code, "pt-BR"));
          return (
            <article key={zone.id} className="rounded-lg border border-[#E2E8F0] p-4" data-testid="zone-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1A1A1A]">
                    {zone.name}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${zone.active ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#F1F5F9] text-[#64748B]"}`}>
                      {zone.active ? "Ativa" : "Inativa"}
                    </span>
                  </h3>
                  <p className="mt-1 text-xs text-[#64748B]">
                    {names.length} {names.length === 1 ? "país" : "países"}: {names.join(", ")}
                  </p>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">
                    {zone.rates.length} {zone.rates.length === 1 ? "faixa" : "faixas"} de tarifa
                  </p>
                </div>
                {confirmDelete === zone.id ? (
                  <div className="flex items-center gap-2 text-sm" data-testid="zone-delete-confirm">
                    <span className="text-[#991B1B]">Remover a zona e as {zone.rates.length} faixas?</span>
                    <button type="button" onClick={() => void removeZone(zone.id)} className="rounded bg-[#DC2626] px-3 py-1 text-xs font-medium text-white">
                      Sim, remover
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="rounded border border-[#E2E8F0] px-3 py-1 text-xs">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenRates(openRates === zone.id ? null : zone.id)}
                      className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F8FAFC]"
                    >
                      {openRates === zone.id ? "Fechar tarifas" : "Tarifas"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setEditing({ mode: "edit", zoneId: zone.id });
                      }}
                      className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F8FAFC]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(zone.id)}
                      className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#DC2626]"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>
              {openRates === zone.id && <RatesTable key={`${zone.id}-${zone.rates.map((r) => r.id).join(",")}`} zoneId={zone.id} rates={zone.rates} onChanged={load} />}
            </article>
          );
        })}
      </div>

      <div className="mt-6">
        <SimulationPanel />
      </div>
    </section>
  );
}
