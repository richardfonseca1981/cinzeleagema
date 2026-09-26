import { Navigate, Outlet } from "react-router-dom";
import { getSession } from "../lib/auth";

export function ProtectedRoute() {
  const session = getSession();
  if (!session) {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}
