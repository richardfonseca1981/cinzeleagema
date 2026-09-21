import { ShieldCheckIcon } from "./icons";

export function Certification() {
  return (
    <section className="bg-[#F1F5F9] py-16 sm:py-20">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 text-center sm:flex-row sm:text-left">
        <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#94A3B8] text-[#94A3B8]">
          <ShieldCheckIcon className="h-10 w-10" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#94A3B8]">
            Selo de certificação gemológica (placeholder — em obtenção)
          </p>
          <h2 className="mt-1 text-xl font-bold text-[#1A1A1A] sm:text-2xl">Procedência e transparência em cada peça</h2>
          <p className="mt-1 text-sm font-semibold text-[#1B3A6B]">Autenticidade documentada</p>
          <p className="mt-3 leading-relaxed text-[#64748B]">
            Trabalhamos para atender aos padrões de referência do setor gemológico, buscando
            alinhamento com instituições como o IBGM (Instituto Brasileiro de Gemas e Metais
            Preciosos). O laudo gemológico de cada peça, quando disponível, será exibido nesta
            seção assim que o processo de padronização da documentação for concluído.
          </p>
        </div>
      </div>
    </section>
  );
}
