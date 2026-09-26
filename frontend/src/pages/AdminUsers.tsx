import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../components/Toast";
import { getSession } from "../lib/auth";
import type { AdminUserSummary } from "../types";

export function AdminUsers() {
  const { showToast } = useToast();
  const session = getSession();
  const [admins, setAdmins] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function loadAdmins() {
    setLoading(true);
    api
      .listAdminUsers()
      .then(setAdmins)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (username.includes("@") || /\s/.test(username)) {
      setFormError("Usuário não pode conter espaços nem @");
      return;
    }
    if (password.length < 6) {
      setFormError("Senha deve ter ao menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("As senhas não coincidem");
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createAdminUser({ username, password });
      setAdmins((prev) => [...prev, created]);
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      showToast("success", "Usuário admin criado");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Não foi possível criar o usuário");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(admin: AdminUserSummary) {
    try {
      const updated = await api.deactivateAdminUser(admin.id);
      setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      showToast("success", "Usuário desativado");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível desativar o usuário");
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-[#1A1A1A]">Usuários admin</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-6 max-w-md space-y-4 rounded-lg border border-[#E2E8F0] bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-[#1A1A1A]">Novo usuário</h2>

        {formError && (
          <p className="rounded-lg border border-[#EF4444] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">
            {formError}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-[#1A1A1A]">Usuário</label>
          <input
            type="text"
            required
            autoComplete="off"
            placeholder="Ex: joao.silva"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1A1A1A]">Senha</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1A1A1A]">Confirmar senha</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[#1B3A6B] py-2 text-sm font-medium text-white transition hover:bg-[#152D54] disabled:opacity-50"
        >
          {submitting ? "Criando..." : "Criar usuário"}
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F8FAFC] text-[#64748B]">
            <tr>
              <th className="px-4 py-2">Usuário</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Criado em</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[#64748B]">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading &&
              admins.map((admin) => {
                const isSelf = admin.id === session?.admin.id;
                return (
                  <tr key={admin.id} className={`border-t border-[#E2E8F0] ${!admin.active ? "bg-[#F8FAFC]" : ""}`}>
                    <td className="px-4 py-2 text-[#1A1A1A]">
                      {admin.username}
                      {isSelf && <span className="ml-2 text-xs text-[#94A3B8]">(você)</span>}
                    </td>
                    <td className="px-4 py-2 text-[#64748B]">{admin.role}</td>
                    <td className="px-4 py-2 text-[#64748B]">
                      {new Date(admin.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          admin.active
                            ? "border-[#22C55E] bg-[#F0FDF4] text-[#15803D]"
                            : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
                        }`}
                      >
                        {admin.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {admin.active && !isSelf && (
                        <button onClick={() => handleDeactivate(admin)} className="text-[#64748B] hover:underline">
                          Desativar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
