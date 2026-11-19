import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import "../i18n";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MlTitlePanel } from "./MlTitlePanel";
import { ToastProvider } from "./Toast";
import type { MercadoLivreTitleSuggestions, Product } from "../types";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getMlTitleSuggestions: vi.fn(),
      updateProduct: vi.fn(),
      approveMlTitle: vi.fn(),
      unapproveMlTitle: vi.fn(),
    },
  };
});

import { api } from "../lib/api";

const mockedSuggestions = vi.mocked(api.getMlTitleSuggestions);
const mockedUpdate = vi.mocked(api.updateProduct);
const mockedApprove = vi.mocked(api.approveMlTitle);
const mockedUnapprove = vi.mocked(api.unapproveMlTitle);

const EMPTY_SUGGESTIONS: MercadoLivreTitleSuggestions = {
  productId: "prod-1",
  currentName: "Ametista Lapidada",
  titleA: "Ametista Lapidada Natural",
  titleALength: 26,
  titleB: "Pedra Natural Ametista Lapidada",
  titleBLength: 32,
  warnings: [],
  collisions: [],
};

function renderPanel(props: Partial<{ mlTitle: string | null; mlTitleApprovedAt: string | null }> = {}) {
  const onChange = vi.fn();
  const result = render(
    <ToastProvider>
      <MlTitlePanel
        productId="prod-1"
        mlTitle={props.mlTitle ?? null}
        mlTitleApprovedAt={props.mlTitleApprovedAt ?? null}
        onChange={onChange}
      />
    </ToastProvider>
  );
  return { ...result, onChange };
}

beforeEach(() => {
  mockedSuggestions.mockReset().mockResolvedValue(EMPTY_SUGGESTIONS);
  mockedUpdate.mockReset();
  mockedApprove.mockReset();
  mockedUnapprove.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("MlTitlePanel", () => {
  it("sem título salvo: mostra badge 'sugerido, não aprovado' e as sugestões A/B carregadas", async () => {
    renderPanel();
    await waitFor(() => expect(mockedSuggestions).toHaveBeenCalledWith("prod-1"));

    expect(screen.getByText("Sugerido, não aprovado")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Ametista Lapidada Natural/)).toBeInTheDocument());
    expect(screen.getByText(/Pedra Natural Ametista Lapidada/)).toBeInTheDocument();
  });

  it("com título aprovado: mostra badge 'Aprovado' e botão 'Remover aprovação'", async () => {
    renderPanel({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: "2026-01-01T00:00:00.000Z" });
    await waitFor(() => expect(mockedSuggestions).toHaveBeenCalled());

    expect(screen.getByText("Aprovado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover aprovação" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  });

  it("'Usar' preenche o campo com a sugestão, e Salvar chama updateProduct com o texto", async () => {
    mockedUpdate.mockResolvedValue({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: null } as Product);
    const { onChange } = renderPanel();
    await waitFor(() => expect(screen.getByText(/Ametista Lapidada Natural/)).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: "Usar" })[0]);
    expect(screen.getByDisplayValue("Ametista Lapidada Natural")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar título" }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith("prod-1", { mlTitle: "Ametista Lapidada Natural" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: null }));
  });

  it("botão Salvar fica desabilitado sem alteração no campo", async () => {
    renderPanel({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: null });
    await waitFor(() => expect(mockedSuggestions).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Salvar título" })).toBeDisabled();
  });

  it("Aprovar chama approveMlTitle e atualiza o estado", async () => {
    mockedApprove.mockResolvedValue({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: "2026-01-02T00:00:00.000Z" } as Product);
    const { onChange } = renderPanel({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: null });
    await waitFor(() => expect(mockedSuggestions).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(mockedApprove).toHaveBeenCalledWith("prod-1"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: "2026-01-02T00:00:00.000Z" })
    );
  });

  it("Remover aprovação chama unapproveMlTitle", async () => {
    mockedUnapprove.mockResolvedValue({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: null } as Product);
    const { onChange } = renderPanel({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: "2026-01-01T00:00:00.000Z" });
    await waitFor(() => expect(mockedSuggestions).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Remover aprovação" }));
    await waitFor(() => expect(mockedUnapprove).toHaveBeenCalledWith("prod-1"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: null }));
  });

  it("mostra aviso de colisão quando a sugestão colide com o mlTitle de outra peça", async () => {
    mockedSuggestions.mockResolvedValue({
      ...EMPTY_SUGGESTIONS,
      collisions: [{ field: "titleA", productId: "prod-2", mlTitle: "Ametista Lapidada Natural" }],
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Colide com o título já aprovado/)).toBeInTheDocument());
  });
});
