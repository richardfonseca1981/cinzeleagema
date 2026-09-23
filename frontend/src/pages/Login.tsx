import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { setSession } from "../lib/auth";

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await api.login(username, password);
      setSession(session);
      navigate("/produtos");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Usuário ou senha incorretos");
      } else {
        setError("Não foi possível entrar. Tente novamente em instantes.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-[#E2E8F0] bg-white p-8 shadow-sm"
      >
        <div className="text-center">
          <h1 className="text-xl font-bold text-[#1A1A1A]">Painel Admin</h1>
          <p className="mt-1 text-sm text-[#64748B]">Entre com seu usuário para continuar</p>
        </div>

        {error && (
          <p className="rounded-lg border border-[#EF4444] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">{error}</p>
        )}

        <div>
          <label className="block text-sm font-medium text-[#1A1A1A]">Usuário</label>
          <input
            type="text"
            required
            autoFocus
            autoComplete="username"
            placeholder="Digite seu usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1A1A1A]">Senha</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[#1B3A6B] py-2 font-medium text-white transition hover:bg-[#152D54] disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
