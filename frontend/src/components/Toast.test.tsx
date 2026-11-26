import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function TriggerButton({ action }: { action?: () => void }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast("success", "Ação concluída", action ? { label: "Desfazer", onClick: action } : undefined)}>
      Disparar
    </button>
  );
}

function TriggerWithDuration({ durationMs, action }: { durationMs: number; action?: () => void }) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        showToast("success", "Peças movidas", action ? { label: "Desfazer", onClick: action } : undefined, { durationMs })
      }
    >
      Disparar
    </button>
  );
}

describe("Toast / ToastProvider", () => {
  it("mostra a mensagem sem botão de ação quando nenhuma ação é passada", () => {
    render(
      <ToastProvider>
        <TriggerButton />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Disparar"));

    expect(screen.getByText("Ação concluída")).toBeInTheDocument();
    expect(screen.queryByText("Desfazer")).not.toBeInTheDocument();
  });

  it("com ação: mostra o botão 'Desfazer', clicar chama o callback e fecha o toast", () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <TriggerButton action={onUndo} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Disparar"));

    const undoButton = screen.getByText("Desfazer");
    fireEvent.click(undoButton);

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Ação concluída")).not.toBeInTheDocument();
  });

  it("sem ação, some sozinho depois da duração padrão (4s)", () => {
    render(
      <ToastProvider>
        <TriggerButton />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Disparar"));

    expect(screen.getByText("Ação concluída")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText("Ação concluída")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Ação concluída")).not.toBeInTheDocument();
  });

  it("com ação e sem duração customizada, uma peça só: continua visível por pelo menos 8s", () => {
    render(
      <ToastProvider>
        <TriggerButton action={vi.fn()} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Disparar"));

    act(() => vi.advanceTimersByTime(7999));
    expect(screen.getByText("Ação concluída")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Ação concluída")).not.toBeInTheDocument();
  });

  it("duração customizada (movimentação de várias peças): continua visível por pelo menos 15s, não antes", () => {
    render(
      <ToastProvider>
        <TriggerWithDuration durationMs={15000} action={vi.fn()} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Disparar"));

    act(() => vi.advanceTimersByTime(14999));
    expect(screen.getByText("Peças movidas")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Peças movidas")).not.toBeInTheDocument();
  });

  it("passar o mouse por cima pausa a contagem; tirar o mouse retoma de onde parou (não reinicia do zero)", () => {
    render(
      <ToastProvider>
        <TriggerWithDuration durationMs={15000} action={vi.fn()} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Disparar"));
    const toast = screen.getByText("Peças movidas").closest("div")!;

    // Passa 10s, entra com o mouse (faltam 5s), fica parado em cima por 20s
    // (bem mais que os 5s restantes) — não pode sumir enquanto o mouse está
    // em cima, senão a proteção do Desfazer falha bem na hora do clique.
    act(() => vi.advanceTimersByTime(10000));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(20000));
    expect(screen.getByText("Peças movidas")).toBeInTheDocument();

    // Tira o mouse: retoma com os 5s que faltavam, não com os 15s inteiros.
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByText("Peças movidas")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Peças movidas")).not.toBeInTheDocument();
  });
});
