export function TrustBanner() {
  return (
    <section className="bg-[#15305A] py-14 text-white">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center">
        <h2 className="text-xl font-bold sm:text-2xl">
          Uma curadoria dedicada à comercialização de pedras preciosas
        </h2>
        <p className="max-w-2xl text-[#93B4D9]">
          Selecionamos cada peça com atenção à autenticidade, à procedência e à qualidade,
          construindo relações de confiança com colecionadores e apaixonados por joalheria.
        </p>
        <a
          href="#sobre"
          className="inline-block rounded-full border border-[#93B4D9]/40 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#93B4D9]/10"
        >
          Saiba mais
        </a>
      </div>
    </section>
  );
}
