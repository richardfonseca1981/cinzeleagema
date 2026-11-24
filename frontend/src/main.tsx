import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";
import { initAnalytics } from "./lib/analytics";

// Fora de qualquer componente/efeito de propósito: roda uma única vez, antes
// do primeiro render, pra registrar o Consent Mode default (ver
// lib/analytics.ts) antes de qualquer outra coisa poder disparar um evento.
initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
