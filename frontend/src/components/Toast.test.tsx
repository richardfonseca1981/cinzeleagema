import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { ToastProvider, useToast } from "./Toast";

afterEach(() => cleanup());

function TriggerButton({ action }: { action?: () => void }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast("success", "Ação concluída", action ? { label: "Desfazer", onClick: action } : undefined)}>
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
});
