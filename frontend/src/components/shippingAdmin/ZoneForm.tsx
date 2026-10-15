import { FormEvent, useState } from "react";
import { CountryPicker } from "./CountryPicker";

export interface ZoneFormValues {
  name: string;
  countries: string[];
  active: boolean;
}

interface ZoneFormProps {
  title: string;
  initial: ZoneFormValues;
  saving: boolean;
  error: string | null;
  onSubmit: (values: ZoneFormValues) => void;
  onCancel: () => void;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none transition focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20";

export function ZoneForm({ title, initial, saving, error, onSubmit, onCancel }: ZoneFormProps) {
  const [name, setName] = useState(initial.name);
  const [countries, setCountries] = useState(initial.countries);
  const [active, setActive] = useState(initial.active);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setLocalError("Informe o nome da zona");
    if (countries.length === 0) return setLocalError("Escolha ao menos um país");
    setLocalError(null);
    onSubmit({ name: name.trim(), countries, active });
  }

  const shownError = localError ?? error;

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-[#C78F50]/50 bg-[#FFFDF9] p-4" data-testid="zone-form">
      <h3 className="text-sm font-semibold text-[#1A1A1A]">{title}</h3>

      <label className="mt-3 block text-sm font-medium text-[#1A1A1A]">
        Nome da zona
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex: América do Norte" className={inputClass} />
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm text-[#1A1A1A]">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#C78F50]" />
        Zona ativa
      </label>

      <div className="mt-3">
        <p className="text-sm font-medium text-[#1A1A1A]">Países desta zona</p>
        <p className="mb-2 text-xs text-[#64748B]">O mesmo país não pode estar em duas zonas ativas.</p>
        <CountryPicker selected={countries} onChange={setCountries} />
      </div>

      {shownError && (
        <p className="mt-3 rounded-lg bg-[#FEF2F2] px-3 py-2 text-sm text-[#991B1B]" role="alert" data-testid="zone-form-error">
          {shownError}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F] disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar zona"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#1A1A1A] hover:bg-[#F8FAFC]">
          Cancelar
        </button>
      </div>
    </form>
  );
}
