import { afterEach, describe, expect, it, vi } from "vitest";
import "./setup";

vi.mock("../src/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "test-key" },
}));

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { translateProductText } from "../src/lib/claude";

function toolUseResponse(input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", name: "translate_product", input }],
  };
}

afterEach(() => {
  mockCreate.mockReset();
});

describe("translateProductText", () => {
  it("returns null when the AI returns a placeholder/error marker as nameEn (bug that caused \"<UNKNOWN>\" to appear on the public site)", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ nameEn: "<UNKNOWN>", descriptionEn: "Some description" }));

    const result = await translateProductText("Diamante", "Pedra rara.");

    expect(result).toBeNull();
  });

  it("rejects other common placeholder variants (case-insensitive, with/without brackets)", async () => {
    for (const placeholder of ["unknown", "N/A", "[N/A]", "null", "NONE", "<error>"]) {
      mockCreate.mockResolvedValue(toolUseResponse({ nameEn: placeholder, descriptionEn: "Real translation" }));
      const result = await translateProductText("Diamante", "Pedra rara.");
      expect(result, `expected null for nameEn="${placeholder}"`).toBeNull();
    }
  });

  it("keeps a valid nameEn but nulls descriptionEn when only the description is a placeholder", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ nameEn: "Diamond", descriptionEn: "<UNKNOWN>" }));

    const result = await translateProductText("Diamante", "Pedra rara.");

    expect(result).toEqual({ nameEn: "Diamond", descriptionEn: null });
  });

  it("accepts a real translation normally", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ nameEn: "Diamond", descriptionEn: "Rare, brilliant-cut stone." }));

    const result = await translateProductText("Diamante", "Pedra rara, lapidação brilhante.");

    expect(result).toEqual({ nameEn: "Diamond", descriptionEn: "Rare, brilliant-cut stone." });
  });

  it("returns descriptionEn null (not an error) when there was no original PT description to translate", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ nameEn: "Diamond" }));

    const result = await translateProductText("Diamante", null);

    expect(result).toEqual({ nameEn: "Diamond", descriptionEn: null });
  });
});
