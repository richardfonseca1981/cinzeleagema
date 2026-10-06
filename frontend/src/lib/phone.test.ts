import { describe, expect, it } from "vitest";
import { normalizePhone, sanitizePhoneInput } from "./phone";

describe("normalizePhone", () => {
  it("normalizes a Brazilian number without '+' by adding +55", () => {
    expect(normalizePhone("11999990000")).toBe("+5511999990000");
  });

  it("accepts an 8-digit (no 9) Brazilian number too", () => {
    expect(normalizePhone("1433334444")).toBe("+551433334444");
  });

  it("keeps an already-complete +55 number unchanged", () => {
    expect(normalizePhone("+5511999990000")).toBe("+5511999990000");
  });

  it("keeps an international number unchanged, without adding +55", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  it("strips formatting punctuation before validating", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe("+5511999990000");
    expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
  });

  it("rejects letters, empty input, or numbers that are too short/long", () => {
    expect(normalizePhone("abc12345678")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("+123")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });
});

describe("sanitizePhoneInput", () => {
  it("keeps digits, spaces, parentheses and hyphens", () => {
    expect(sanitizePhoneInput("(11) 99999-0000")).toBe("(11) 99999-0000");
  });

  it("keeps a leading '+' but strips letters", () => {
    expect(sanitizePhoneInput("+1 415a 555b 2671")).toBe("+1 415 555 2671");
  });

  it("drops a '+' typed anywhere other than the start", () => {
    expect(sanitizePhoneInput("11+999990000")).toBe("11999990000");
  });
});
