import { afterEach, describe, expect, it } from "vitest";
import "../i18n";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProductGallery } from "./ProductGallery";
import type { GalleryItem } from "../lib/gallery";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const ITEMS: GalleryItem[] = [
  { type: "image", id: "a", url: "https://example.com/a.jpg" },
  { type: "image", id: "b", url: "https://example.com/b.jpg" },
];

describe("ProductGallery — abrir o visualizador", () => {
  it("peça sem foto: não renderiza nenhum botão de ampliar", () => {
    render(<ProductGallery items={[]} name="Ametista" />);
    expect(screen.queryByRole("button", { name: "Ampliar foto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clicar na foto principal abre o visualizador no índice tocado", () => {
    render(<ProductGallery items={ITEMS} name="Ametista" />);
    const zoomButtons = screen.getAllByRole("button", { name: "Ampliar foto" });
    fireEvent.click(zoomButtons[0]);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("1/2")).toBeInTheDocument();
  });

  it("fecha com o botão × e devolve o foco ao botão que abriu", async () => {
    render(<ProductGallery items={ITEMS} name="Ametista" />);
    const zoomButton = screen.getAllByRole("button", { name: "Ampliar foto" })[0];
    zoomButton.focus();
    fireEvent.click(zoomButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    // Fechar passa por history.back() -> popstate, que só resolve depois do clique.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(zoomButton).toHaveFocus();
  });

  it("fecha com a tecla Esc", async () => {
    render(<ProductGallery items={ITEMS} name="Ametista" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Ampliar foto" })[0]);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("navega para a próxima foto pela seta do visualizador e mostra o contador atualizado", () => {
    render(<ProductGallery items={ITEMS} name="Ametista" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Ampliar foto" })[0]);

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Próxima foto" }));

    expect(within(dialog).getByText("2/2")).toBeInTheDocument();
  });

  it("não quebra as miniaturas/setas do carrossel ao adicionar o botão de ampliar", () => {
    render(<ProductGallery items={ITEMS} name="Ametista" />);
    // Miniaturas (desktop) ainda navegam a foto principal sem abrir o visualizador.
    const thumbnail = screen.getByRole("button", { name: "Ver foto 2 de 2" });
    fireEvent.click(thumbnail);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
