import { afterEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImageViewer } from "./ImageViewer";
import type { GalleryItem } from "../lib/gallery";

const ITEMS: GalleryItem[] = [
  { type: "image", id: "a", url: "https://example.com/a.jpg" },
  { type: "image", id: "b", url: "https://example.com/b.jpg" },
  { type: "image", id: "c", url: "https://example.com/c.jpg" },
];

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("ImageViewer", () => {
  it("abre com role dialog, aria-modal e o rótulo traduzido, no índice pedido", () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={1} name="Ametista" onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "Foto de Ametista em tela cheia" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("foca o botão fechar ao abrir e trava o scroll do body", () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restaura o scroll do body ao desmontar", () => {
    const onClose = vi.fn();
    const { unmount } = render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("fecha com o botão × (via Voltar do histórico, chamando onClose)", async () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("fecha com a tecla Esc", async () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("o botão Voltar do navegador (popstate) fecha o visualizador", async () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("clicar em um botão de controle não fecha o visualizador", () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("fecha ao clicar no fundo escuro fora da foto, sem zoom", async () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    // clientX/clientY fora do retângulo (zero em jsdom) da foto — em um
    // navegador real seria qualquer ponto fora da foto renderizada.
    const backdrop = screen.getByRole("dialog").querySelector(".touch-none") as HTMLElement;
    fireEvent.click(backdrop, { clientX: 500, clientY: 500 });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("NÃO fecha ao clicar no fundo quando está com zoom", () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    const backdrop = screen.getByRole("dialog").querySelector(".touch-none") as HTMLElement;
    fireEvent.click(backdrop, { clientX: 500, clientY: 500 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("setas anterior/próxima navegam e o contador acompanha", () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Próxima foto" }));
    expect(screen.getByText("2/3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Foto anterior" }));
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("as setas do teclado ← → navegam entre fotos", () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(screen.getByText("2/3")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("seta anterior desabilitada na primeira foto e próxima desabilitada na última", () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Foto anterior" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Próxima foto" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima foto" }));
    expect(screen.getByRole("button", { name: "Próxima foto" })).toBeDisabled();
  });

  it("o botão de zoom in/out/redefinir existe com os rótulos traduzidos", () => {
    const onClose = vi.fn();
    render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />);

    expect(screen.getByRole("button", { name: "Aumentar zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diminuir zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redefinir zoom" })).toBeInTheDocument();
  });

  it("trocar de foto pelas setas reseta o zoom para 1x (botão redefinir some do estado ampliado de novo)", () => {
    const onClose = vi.fn();
    const dialog = render(<ImageViewer items={ITEMS} initialIndex={0} name="Ametista" onClose={onClose} />).container;

    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    expect((dialog.querySelector("img") as HTMLImageElement).style.transform).toContain("scale(1.4)");

    fireEvent.click(screen.getByRole("button", { name: "Próxima foto" }));
    // A troca de foto remonta o <img> (key={item.id}) — precisa reconsultar o DOM.
    expect((dialog.querySelector("img") as HTMLImageElement).style.transform).toContain("scale(1)");
  });

  it("sem itens, não renderiza nada", () => {
    const onClose = vi.fn();
    const { container } = render(<ImageViewer items={[]} initialIndex={0} name="Ametista" onClose={onClose} />);
    expect(container).toBeEmptyDOMElement();
  });
});
