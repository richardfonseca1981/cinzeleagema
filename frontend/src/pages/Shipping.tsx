import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ShippingStatus } from "../types";

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#FEE2E2] text-[#991B1B]"
      }`}
    >
      {ok ? "Sim" : "Não"}
    </span>
  );
}

// Página somente leitura — nunca exibe valores de variáveis de ambiente, só
// se estão configuradas. A seção "Internacional" fica pronta para a Parte
// 1B (frete internacional) preencher.
export function Shipping() {
  const [status, setStatus] = useState<ShippingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .getShippingStatus()
      .then(setStatus)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-[#64748B]">Carregando...</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-[#1A1A1A]">Frete</h1>

      {error || !status ? (
        <p className="text-sm text-[#991B1B]">Não foi possível carregar o status do frete.</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-lg border border-[#E2E8F0] bg-white p-6">
            <h2 className="mb-1 text-sm font-semibold text-[#1A1A1A]">Nacional (Melhor Envio)</h2>
            <p className="mb-4 text-xs text-[#64748B]">
              Cotação automática via Melhor Envio. Configuração feita por variáveis de ambiente no servidor — nenhum valor é
              exibido aqui, só se cada item está configurado.
            </p>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                <dt className="text-[#1A1A1A]">Token do Melhor Envio configurado</dt>
                <dd>
                  <StatusBadge ok={status.domestic.melhorEnvioTokenConfigured} />
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                <dt className="text-[#1A1A1A]">CEP de origem configurado</dt>
                <dd>
                  <StatusBadge ok={status.domestic.originCepConfigured} />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#1A1A1A]">Modo sandbox (testes)</dt>
                <dd>
                  <StatusBadge ok={status.domestic.sandbox} />
                </dd>
              </div>
            </dl>
            {!status.domestic.melhorEnvioTokenConfigured || !status.domestic.originCepConfigured ? (
              <p className="mt-4 text-xs text-[#991B1B]">
                Faltando configuração: o frete nacional vai responder como indisponível para o comprador até isso ser
                resolvido no ambiente do servidor.
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-[#E2E8F0] bg-white p-6 opacity-60">
            <h2 className="mb-1 text-sm font-semibold text-[#1A1A1A]">Internacional</h2>
            <p className="text-xs text-[#64748B]">Ainda não implementado — chega em uma próxima etapa.</p>
          </section>
        </div>
      )}
    </div>
  );
}
