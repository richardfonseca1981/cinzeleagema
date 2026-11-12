import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";

// Destino do ML_REDIRECT_URI configurado na aplicação do Mercado Livre (ver
// .env.example e CONTEXT.md) — lê code/state da querystring e repassa ao
// backend já com o Authorization: Bearer do admin logado (a rota
// /api/admin/mercadolivre/callback exige requireAuth).
const REDIRECT_DELAY_MS = 1800;
const PANEL_PATH = "/admin/mercadolivre";
// O code/state do Mercado Livre expiram em poucos minutos (10 min, ver
// backend lib/mercadoLivre/auth.ts) — bem menos que a sessão do admin (padrão
// 8h, ver JWT_EXPIRES_IN). Se a sessão expirou a ponto de dar 401 aqui, o
// code/state quase certamente também já expiraram: em vez de tentar repetir
// a troca depois do login (que ia falhar de novo com "state expirado"),
// manda o admin direto para o painel para reiniciar a conexão do zero.
const LOGIN_AGAIN_HREF = `/admin?returnTo=${encodeURIComponent(PANEL_PATH)}`;

type CallbackState =
  | { kind: "connecting" }
  | { kind: "success"; nickname: string }
  | { kind: "error"; message: string }
  | { kind: "sessionExpired" };

export function MercadoLivreCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<CallbackState>({ kind: "connecting" });
  const redirectTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    document.title = "Cinzel e a Gema Admin";
  }, []);

  useEffect(() => {
    const code = searchParams.get("code");
    const mlState = searchParams.get("state");

    if (!code || !mlState) {
      setState({ kind: "error", message: t("mercadoLivreAdmin.callback.missingCode") });
      return;
    }

    let cancelled = false;
    api
      .handleMercadoLivreCallback(code, mlState)
      .then((result) => {
        if (cancelled) return;
        setState({ kind: "success", nickname: result.nickname ?? "" });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setState({ kind: "sessionExpired" });
          return;
        }
        const message = err instanceof ApiError ? err.message : t("mercadoLivreAdmin.callback.genericError");
        setState({ kind: "error", message });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redireciona automaticamente só em sucesso/erro "normal" — sessionExpired
  // precisa do clique explícito em "Fazer login novamente" (ver
  // LOGIN_AGAIN_HREF acima) e "connecting" ainda está em andamento.
  useEffect(() => {
    if (state.kind !== "success" && state.kind !== "error") return;
    redirectTimer.current = setTimeout(() => navigate(PANEL_PATH, { replace: true }), REDIRECT_DELAY_MS);
    return () => clearTimeout(redirectTimer.current);
  }, [state.kind, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.callback.title")}</h1>

        {state.kind === "connecting" && (
          <p className="text-sm text-[#64748B]" role="status">
            {t("mercadoLivreAdmin.callback.connecting")}
          </p>
        )}

        {state.kind === "success" && (
          <p className="rounded-lg border border-[#22C55E] bg-[#F0FDF4] px-3 py-2 text-sm text-[#15803D]" role="status">
            {t("mercadoLivreAdmin.callback.success")}
            {state.nickname && <> {t("mercadoLivreAdmin.callback.successDetail", { nickname: state.nickname })}</>}
          </p>
        )}

        {state.kind === "error" && (
          <p className="rounded-lg border border-[#EF4444] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]" role="alert">
            {state.message}
          </p>
        )}

        {state.kind === "sessionExpired" && (
          <p className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-3 py-2 text-sm text-[#B45309]" role="alert">
            {t("mercadoLivreAdmin.callback.sessionExpired")}
          </p>
        )}

        {state.kind === "sessionExpired" ? (
          <a
            href={LOGIN_AGAIN_HREF}
            className="block w-full rounded-lg bg-[#C78F50] py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F]"
          >
            {t("mercadoLivreAdmin.callback.loginAgain")}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => navigate(PANEL_PATH, { replace: true })}
            className="w-full rounded-lg bg-[#C78F50] py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F]"
          >
            {t("mercadoLivreAdmin.callback.backToPanel")}
          </button>
        )}
      </div>
    </div>
  );
}
