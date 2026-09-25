import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { clearSession, getSession } from "../lib/auth";

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();

  useEffect(() => {
    document.title = "Cinzel e a Gema Admin";
  }, []);

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  const isProductsSection = location.pathname.startsWith("/produtos");

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <aside className="flex w-56 flex-shrink-0 flex-col bg-[#1B3A6B] text-white">
        <div className="border-b border-white/10 px-5 py-5">
          <img src={logo} alt="Cinzel e a Gema" className="w-28 object-contain" />
          <div className="mt-1 text-xs font-medium text-white/60">Admin</div>
        </div>
        <nav className="mt-2 flex flex-col gap-1 px-3">
          <Link
            to="/produtos"
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              isProductsSection ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            Produtos
          </Link>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="border-b border-[#E2E8F0] bg-white">
          <div className="flex items-center justify-end gap-4 px-6 py-3 text-sm text-[#64748B]">
            <span>{session?.admin.username}</span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-[#E2E8F0] px-3 py-1 transition hover:bg-[#F8FAFC]"
            >
              Sair
            </button>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
