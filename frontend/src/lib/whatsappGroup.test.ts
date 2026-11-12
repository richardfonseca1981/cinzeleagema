import { afterEach, describe, expect, it, vi } from "vitest";

const DEFAULT_URL = "https://chat.whatsapp.com/KN60WlSdW9K9yQNLna5kHy";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("WHATSAPP_GROUP_URL", () => {
  it("usa o link padrão quando a variável de ambiente não está definida", async () => {
    vi.stubEnv("VITE_WHATSAPP_GROUP_URL", "");
    const { WHATSAPP_GROUP_URL } = await import("./whatsappGroup");
    expect(WHATSAPP_GROUP_URL).toBe(DEFAULT_URL);
  });

  it("usa a variável de ambiente quando ela está definida, sobrescrevendo o padrão", async () => {
    vi.stubEnv("VITE_WHATSAPP_GROUP_URL", "https://chat.whatsapp.com/CUSTOM123");
    const { WHATSAPP_GROUP_URL } = await import("./whatsappGroup");
    expect(WHATSAPP_GROUP_URL).toBe("https://chat.whatsapp.com/CUSTOM123");
  });
});
