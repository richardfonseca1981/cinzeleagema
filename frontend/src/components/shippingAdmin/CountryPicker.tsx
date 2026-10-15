import { useMemo, useState } from "react";
import { listCountries } from "../../lib/shipping/countries";
import { filterCountries, sortSelected } from "../../lib/shippingAdmin";

interface CountryPickerProps {
  selected: string[];
  onChange: (codes: string[]) => void;
}

// Seleção múltipla de países com busca; nomes em português. O Brasil não
// aparece: o frete nacional é cotado pela Melhor Envio.
const ALL_OPTIONS = listCountries("pt-BR").filter((o) => o.code !== "BR");

export function CountryPicker({ selected, onChange }: CountryPickerProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterCountries(ALL_OPTIONS, query), [query]);
  const chosen = useMemo(() => sortSelected(selected, ALL_OPTIONS), [selected]);

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  return (
    <div data-testid="country-picker">
      <div className="flex min-h-[2rem] flex-wrap gap-1.5" data-testid="selected-countries">
        {chosen.length === 0 ? (
          <span className="text-xs text-[#94A3B8]">Nenhum país escolhido</span>
        ) : (
          chosen.map((country) => (
            <span key={country.code} className="inline-flex items-center gap-1 rounded-full bg-[#C78F50]/15 px-2.5 py-0.5 text-xs font-medium text-[#1A1A1A]">
              {country.name}
              <button
                type="button"
                onClick={() => toggle(country.code)}
                aria-label={`Remover ${country.name}`}
                className="text-[#64748B] hover:text-[#DC2626]"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar país (ex: Estados Unidos, Portugal)"
        aria-label="Buscar país"
        className="mt-2 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none transition focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20"
      />

      <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white" aria-label="Países">
        {visible.length === 0 ? (
          <li className="px-3 py-2 text-sm text-[#64748B]">Nenhum país encontrado</li>
        ) : (
          visible.map((country) => (
            <li key={country.code}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-[#F8FAFC]">
                <input
                  type="checkbox"
                  checked={selected.includes(country.code)}
                  onChange={() => toggle(country.code)}
                  className="h-4 w-4 accent-[#C78F50]"
                />
                <span className="flex-1">{country.name}</span>
                <span className="text-xs text-[#94A3B8]">{country.code}</span>
              </label>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
