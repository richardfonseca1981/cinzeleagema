import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { WhatsAppIcon } from "./icons";

export function ContactModal({
  open,
  onClose,
  whatsappHref,
}: {
  open: boolean;
  onClose: () => void;
  whatsappHref: string | null;
}) {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Site estático, sem backend: não há envio real ainda. Quando um
    // serviço de e-mail/backend estiver disponível, conectar o submit deste
    // formulário a ele em vez de só mostrar a mensagem de fallback abaixo.
    setSubmitted(true);
  }

  function handleClose() {
    setSubmitted(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Fale Conosco">
      {submitted ? (
        <div className="text-center">
          <div className="rounded-lg bg-[#F0FDF4] p-4">
            <p className="text-sm font-semibold text-[#22C55E]">Mensagem recebida</p>
            <p className="mt-1 text-sm text-[#1A1A1A]">
              Em breve você poderá enviar mensagens por aqui. Por enquanto, fale conosco pelo
              WhatsApp.
            </p>
          </div>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1B3A6B] px-6 py-3 font-semibold text-white transition hover:bg-[#152D54]"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Falar no WhatsApp
            </a>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="contact-name" className="block text-sm font-medium text-[#1A1A1A]">
              Nome completo
            </label>
            <input
              id="contact-name"
              type="text"
              required
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#1B3A6B] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="contact-email" className="block text-sm font-medium text-[#1A1A1A]">
              E-mail
            </label>
            <input
              id="contact-email"
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#1B3A6B] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="contact-subject" className="block text-sm font-medium text-[#1A1A1A]">
              Assunto
            </label>
            <input
              id="contact-subject"
              type="text"
              required
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#1B3A6B] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="contact-message" className="block text-sm font-medium text-[#1A1A1A]">
              Mensagem
            </label>
            <textarea
              id="contact-message"
              rows={4}
              required
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#1B3A6B] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-[#1B3A6B] px-4 py-2.5 font-semibold text-white transition hover:bg-[#152D54]"
          >
            Enviar
          </button>
        </form>
      )}
    </Modal>
  );
}
