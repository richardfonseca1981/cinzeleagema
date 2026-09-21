import { useState } from "react";
import { FAQ_ITEMS } from "./data";
import { ChevronDownIcon } from "./icons";

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-[#EFF6FF] py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#1B3A6B]">FAQ</p>
          <h2 className="mt-2 text-2xl font-bold text-[#1A1A1A] sm:text-3xl">Perguntas frequentes sobre pedras preciosas</h2>
          <p className="mt-4 text-[#64748B]">
            Tire suas dúvidas técnicas sobre pedras preciosas antes de fazer o seu pedido.
          </p>
        </div>

        <div className="mt-10 divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] bg-white">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={item.question}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-medium text-[#1A1A1A]">{item.question}</span>
                  <ChevronDownIcon
                    className={`h-5 w-5 flex-shrink-0 text-[#64748B] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5">
                    <p className="text-sm leading-relaxed text-[#64748B]">{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
