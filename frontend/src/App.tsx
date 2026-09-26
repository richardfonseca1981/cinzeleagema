import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { ProductList } from "./pages/ProductList";
import { ProductForm } from "./pages/ProductForm";
import { AdminUsers } from "./pages/AdminUsers";
import { AdminLayout } from "./components/AdminLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ToastProvider } from "./components/Toast";

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Landing />} />

          <Route path="/admin" element={<Login />} />
          <Route path="/login" element={<Navigate to="/admin" replace />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin/produtos" element={<ProductList />} />
              <Route path="/admin/produtos/novo" element={<ProductForm />} />
              <Route path="/admin/produtos/:id" element={<ProductForm />} />
              <Route path="/admin/usuarios" element={<AdminUsers />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
