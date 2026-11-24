import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConsentProvider, useConsent } from "./consent";

const { updateConsentMock } = vi.hoisted(() => ({ updateConsentMock: vi.fn() }));
vi.mock("./analytics", () => ({ updateConsent: updateConsentMock }));

function Probe() {
  const { choice, bannerOpen, accept, reject, reopen } = useConsent();
  return (
    <div>
      <span data-testid="choice">{choice ?? "null"}</span>
      <span data-testid="banner-open">{String(bannerOpen)}</span>
      <button onClick={accept}>accept</button>
      <button onClick={reject}>reject</button>
      <button onClick={reopen}>reopen</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <ConsentProvider>
      <Probe />
    </ConsentProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  updateConsentMock.mockClear();
});

afterEach(() => cleanup());

describe("ConsentProvider — sem escolha salva", () => {
  it("abre o banner e não chama updateConsent até o visitante decidir", () => {
    renderProbe();
    expect(screen.getByTestId("banner-open")).toHaveTextContent("true");
    expect(screen.getByTestId("choice")).toHaveTextContent("null");
    expect(updateConsentMock).not.toHaveBeenCalled();
  });

  it("aceitar grava 'granted' no localStorage, chama updateConsent(true) e fecha o banner", () => {
    renderProbe();
    fireEvent.click(screen.getByText("accept"));

    expect(screen.getByTestId("choice")).toHaveTextContent("granted");
    expect(screen.getByTestId("banner-open")).toHaveTextContent("false");
    expect(updateConsentMock).toHaveBeenCalledWith(true);

    const stored = JSON.parse(localStorage.getItem("cinzeleagema_consent") ?? "{}");
    expect(stored.choice).toBe("granted");
    expect(typeof stored.timestamp).toBe("string");
  });

  it("rejeitar grava 'denied' no localStorage e chama updateConsent(false)", () => {
    renderProbe();
    fireEvent.click(screen.getByText("reject"));

    expect(screen.getByTestId("choice")).toHaveTextContent("denied");
    expect(updateConsentMock).toHaveBeenCalledWith(false);
    expect(JSON.parse(localStorage.getItem("cinzeleagema_consent") ?? "{}").choice).toBe("denied");
  });
});

describe("ConsentProvider — com escolha salva", () => {
  it("escolha 'granted' salva: não abre o banner no mount e aplica a escolha no Consent Mode", () => {
    localStorage.setItem("cinzeleagema_consent", JSON.stringify({ choice: "granted", timestamp: "2026-01-01T00:00:00.000Z" }));

    renderProbe();

    expect(screen.getByTestId("banner-open")).toHaveTextContent("false");
    expect(screen.getByTestId("choice")).toHaveTextContent("granted");
    expect(updateConsentMock).toHaveBeenCalledWith(true);
  });

  it("reopen() reabre o banner mesmo depois de já ter uma escolha salva", () => {
    localStorage.setItem("cinzeleagema_consent", JSON.stringify({ choice: "denied", timestamp: "2026-01-01T00:00:00.000Z" }));
    renderProbe();
    expect(screen.getByTestId("banner-open")).toHaveTextContent("false");

    fireEvent.click(screen.getByText("reopen"));
    expect(screen.getByTestId("banner-open")).toHaveTextContent("true");
  });

  it("valor inválido no localStorage é tratado como 'sem escolha' (abre o banner)", () => {
    localStorage.setItem("cinzeleagema_consent", "não é json");
    renderProbe();
    expect(screen.getByTestId("banner-open")).toHaveTextContent("true");
  });
});
