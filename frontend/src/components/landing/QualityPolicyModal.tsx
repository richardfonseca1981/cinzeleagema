import { Modal } from "./Modal";

export function QualityPolicyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Política de Qualidade">
      <div className="space-y-4 text-sm leading-relaxed text-[#64748B]">
        <p>
          A Cinzel e a Gema tem o compromisso de representar cada pedra preciosa com precisão —
          peso, corte, origem, claridade e demais características técnicas são descritos com
          base nas informações disponíveis para cada peça, buscando a confiança de todos os
          nossos clientes e parceiros.
        </p>
        <p>
          Como a cor de uma pedra é sensível a distorções por iluminação, as fotos de cada peça
          são produzidas sob luz neutra, com o objetivo de representar o tom real da pedra da
          forma mais fiel possível — sem correção de cor por edição digital.
        </p>
        <p>
          Buscamos a melhoria contínua da nossa curadoria — revisando processos, ouvindo o
          retorno de clientes e acompanhando as referências do setor gemológico — como parte do
          nosso compromisso permanente com a qualidade e a transparência.
        </p>
      </div>
    </Modal>
  );
}
