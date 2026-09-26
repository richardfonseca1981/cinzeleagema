import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { ProductList } from "./pages/ProductList";
import { ProductForm } from "./pages/ProductForm";
import { AdminUsers } from "./pages/AdminUsers";
import { Catalog } from "./pages/Catalog";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Checkout } from "./pages/Checkout";
import { AdminLayout } from "./components/AdminLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ToastProvider } from "./components/Toast";
import { CartProvider } from "./lib/cart";

export default function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />

            <Route path="/catalogo" element={<Catalog />} />
            <Route path="/catalogo/:id" element={<ProductDetail />} />
            <Route path="/carrinho" element={<Cart />} />
            <Route path="/finalizar" element={<Checkout />} />

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
      </CartProvider>
    </BrowserRouter>
  );
}
