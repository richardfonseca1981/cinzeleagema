import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IdentificationPanel } from "./IdentificationPanel";
import { ToastProvider } from "./Toast";
import type { IdentificationProposal, ProductIdentification } from "../types";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getProductIdentification: vi.fn(),
      generateProductIdentification: vi.fn(),
      saveProductIdentification: vi.fn(),
    },
  };
});

import { api } from "../lib/api";

const mockedGet = vi.mocked(api.getProductIdentification);
const mockedGenerate = vi.mocked(api.generateProductIdentification);
const mockedSave = vi.mocked(api.saveProductIdentification);

const EMPTY: ProductIdentification = { identificationPt: null, identificationEn: null, confidence: null, treatment: null, note: null };

const PROPOSAL: IdentificationProposal = {
  identificationPt: "Ágata Azul (Tingida)",
  identificationEn: "Dyed Blue Agate",
  confidence: "ALTA",
  treatment: "TINGIDA",
  note: "Confirmado por cor atípica à espécie",
};

function renderPanel(props: Partial<{ hasPhotos: boolean; productName: string }> = {}) {
  return render(
    <ToastProvider>
      <IdentificationPanel productId="prod-1" productName={props.productName ?? "Ágata Azul"} hasPhotos={props.hasPhotos ?? true} />
    </ToastProvider>
  );
}

beforeEach(() => {
  mockedGet.mockReset().mockResolvedValue(EMPTY);
  mockedGenerate.mockReset();
  mockedSave.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("IdentificationPanel", () => {
  it("desabilita o botão de gerar quando a peça não tem fotos, com a dica certa", async () => {
    renderPanel({ hasPhotos: false });
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());

    const button = screen.getByRole("button", { name: "Gerar identificação com IA" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Adicione ao menos uma foto");
  });

  it("habilita o botão quando a peça tem fotos", async () => {
    renderPanel({ hasPhotos: true });
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Gerar identificação com IA" })).toBeEnabled();
  });

  it("gera e mostra o preview com PT, EN, confiança, tratamento e o aviso fixo", async () => {
    mockedGenerate.mockResolvedValue(PROPOSAL);
    renderPanel();
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Gerar identificação com IA" }));

    await waitFor(() => expect(screen.getByDisplayValue("Ágata Azul (Tingida)")).toBeInTheDocument());
    expect(screen.getByDisplayValue("Dyed Blue Agate")).toBeInTheDocument();
    expect(screen.getByText(/Confiança: Alta/)).toBeInTheDocument();
    expect(screen.getByText(/Tratamento: Tingida/)).toBeInTheDocument();
    expect(screen.getByText("Triagem visual por foto, não é laudo gemológico. Confira antes de publicar.")).toBeInTheDocument();
  });

  it('"Usar esta proposta" grava direto quando não havia identificação salva', async () => {
    mockedGenerate.mockResolvedValue(PROPOSAL);
    mockedSave.mockResolvedValue({
      identificationPt: PROPOSAL.identificationPt,
      identificationEn: PROPOSAL.identificationEn,
      confidence: PROPOSAL.confidence,
      treatment: PROPOSAL.treatment,
      note: PROPOSAL.note ?? null,
    });
    renderPanel();
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Gerar identificação com IA" }));
    await waitFor(() => expect(screen.getByDisplayValue("Ágata Azul (Tingida)")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Usar esta proposta" }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    expect(mockedSave).toHaveBeenCalledWith("prod-1", {
      identificationPt: PROPOSAL.identificationPt,
      identificationEn: PROPOSAL.identificationEn,
      confidence: "ALTA",
      treatment: "TINGIDA",
      note: PROPOSAL.note,
    });
    await waitFor(() => expect(screen.getByText("Identificação salva com sucesso")).toBeInTheDocument());
    // Preview fecha depois de salvar.
    expect(screen.queryByRole("button", { name: "Usar esta proposta" })).not.toBeInTheDocument();
  });

  it('"Descartar" fecha o preview sem chamar a API de salvar', async () => {
    mockedGenerate.mockResolvedValue(PROPOSAL);
    renderPanel();
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Gerar identificação com IA" }));
    await waitFor(() => expect(screen.getByDisplayValue("Ágata Azul (Tingida)")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.queryByDisplayValue("Ágata Azul (Tingida)")).not.toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('pede confirmação ("Já existe uma identificação. Substituir?") antes de substituir uma identificação já salva', async () => {
    mockedGet.mockResolvedValue({
      identificationPt: "Nome antigo",
      identificationEn: "Old name",
      confidence: "MEDIA",
      treatment: "SEM_INDICIO",
      note: null,
    });
    mockedGenerate.mockResolvedValue(PROPOSAL);
    mockedSave.mockResolvedValue({
      identificationPt: PROPOSAL.identificationPt,
      identificationEn: PROPOSAL.identificationEn,
      confidence: PROPOSAL.confidence,
      treatment: PROPOSAL.treatment,
      note: PROPOSAL.note ?? null,
    });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Nome antigo")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Gerar identificação com IA" }));
    await waitFor(() => expect(screen.getAllByDisplayValue("Ágata Azul (Tingida)")).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Usar esta proposta" }));

    expect(screen.getByText("Já existe uma identificação. Substituir?")).toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Substituir" }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
  });

  it("cancelar a confirmação de substituição mantém o preview aberto e não salva", async () => {
    mockedGet.mockResolvedValue({
      identificationPt: "Nome antigo",
      identificationEn: "Old name",
      confidence: "MEDIA",
      treatment: "SEM_INDICIO",
      note: null,
    });
    mockedGenerate.mockResolvedValue(PROPOSAL);
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Nome antigo")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Gerar identificação com IA" }));
    await waitFor(() => expect(screen.getAllByDisplayValue("Ágata Azul (Tingida)")).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Usar esta proposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(mockedSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Usar esta proposta" })).toBeInTheDocument();
  });
});
