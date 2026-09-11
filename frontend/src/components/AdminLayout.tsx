import { Link, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getSession } from "../lib/auth";

export function AdminLayout() {
  const navigate = useNavigate();
  const session = getSession();

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/produtos" className="font-semibold text-slate-800">
            Site Pedras Preciosas — Admin
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span>{session?.admin.email}</span>
            <button onClick={handleLogout} className="rounded bg-slate-200 px-3 py-1 hover:bg-slate-300">
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
