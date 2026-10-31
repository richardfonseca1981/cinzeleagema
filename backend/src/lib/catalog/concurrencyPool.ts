// Processa `items` com no máximo `limit` chamadas de `fn` em paralelo,
// devolvendo os resultados NA ORDEM ORIGINAL via async generator — quem
// consome recebe o resultado do item 0 antes do item 1, mesmo que o item 1
// termine primeiro. Usado para buscar/redimensionar as fotos do catálogo
// (ver generateCatalogPdf) sem segurar mais que `limit` imagens decodificadas
// na memória ao mesmo tempo, e sem esperar a peça N terminar para começar a
// N+1 (ver REGRAS: "concorrência limitada... sem estourar memória com 76+
// fotos").
export async function* mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): AsyncGenerator<R, void, void> {
  const inFlight: Promise<R>[] = [];
  let nextToStart = 0;

  function startNext(): void {
    if (nextToStart >= items.length) return;
    const index = nextToStart;
    nextToStart++;
    inFlight.push(fn(items[index], index));
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) startNext();

  for (let i = 0; i < items.length; i++) {
    const result = await inFlight[i];
    startNext();
    yield result;
  }
}
