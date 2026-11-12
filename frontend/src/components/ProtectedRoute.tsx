import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getSession } from "../lib/auth";

// Sem sessão, preserva a URL completa (path + querystring) em ?returnTo= —
// essencial para /admin/mercadolivre/callback: o admin pode cair aqui sem
// sessão (aba nova, sessão nunca aberta) e precisa voltar para o MESMO
// callback, com code/state intactos, depois de logar (ver Login.tsx).
export function ProtectedRoute() {
  const location = useLocation();
  const session = getSession();
  if (!session) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin?returnTo=${returnTo}`} replace />;
  }
  return <Outlet />;
}
