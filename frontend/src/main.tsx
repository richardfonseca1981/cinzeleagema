import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";
import { initAnalytics } from "./lib/analytics";
import { captureUtmParams } from "./lib/utm";

// Fora de qualquer componente/efeito de propósito: roda uma única vez, antes
// do primeiro render — captura o utm_* da URL de chegada ANTES de qualquer
// redirect client-side poder apagá-lo (ver lib/utm.ts), e registra o Consent
// Mode default (ver lib/analytics.ts) antes de qualquer outra coisa poder
// disparar um evento.
captureUtmParams(window.location.search);
initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
