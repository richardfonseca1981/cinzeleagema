import type { AttributeSchemaField } from "../types";

interface DynamicAttributeFieldsProps {
  schema: AttributeSchemaField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-white";

export function DynamicAttributeFields({ schema, values, onChange }: DynamicAttributeFieldsProps) {
  if (schema.length === 0) {
    return <p className="text-sm text-[#64748B]">Esta categoria não define campos técnicos adicionais.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {schema.map((field) => (
        <div key={field.key}>
          <label className="block text-sm font-medium text-[#1A1A1A]">{field.label}</label>

          {field.type === "boolean" ? (
            <input
              type="checkbox"
              checked={Boolean(values[field.key])}
              onChange={(e) => onChange(field.key, e.target.checked)}
              className="mt-2 h-4 w-4 accent-[#1B3A6B]"
            />
          ) : field.type === "select" ? (
            <select
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={inputClass}
            >
              <option value="">Selecione...</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === "number" ? "number" : "text"}
              value={(values[field.key] as string | number) ?? ""}
              onChange={(e) => onChange(field.key, field.type === "number" ? e.target.valueAsNumber : e.target.value)}
              className={inputClass}
            />
          )}
        </div>
      ))}
    </div>
  );
}
