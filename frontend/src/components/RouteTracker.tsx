import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../lib/analytics";

// Dispara um page_view por troca de ROTA (pathname+search), nunca por
// re-render comum — ver lib/analytics.ts initAnalytics (send_page_view:false,
// pra não contar a visita duas vezes: uma do script, uma daqui). Montado uma
// única vez dentro do BrowserRouter (ver App.tsx), fora de qualquer <Route>.
export function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname, location.search);
  }, [location.pathname, location.search]);

  return null;
}
