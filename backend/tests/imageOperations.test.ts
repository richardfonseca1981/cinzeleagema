import { describe, expect, it } from "vitest";
import { operationSchema, operationsSchema } from "../src/lib/imageOperations";

describe("operationSchema", () => {
  it("accepts a valid resize", () => {
    expect(operationSchema.safeParse({ operation: "resize", width: 800 }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "resize", height: 600 }).success).toBe(true);
  });

  it("rejects resize without width or height", () => {
    expect(operationSchema.safeParse({ operation: "resize" }).success).toBe(false);
  });

  it("accepts a valid crop by aspectRatio", () => {
    expect(operationSchema.safeParse({ operation: "crop", aspectRatio: "4:3" }).success).toBe(true);
  });

  it("accepts a valid crop by width+height", () => {
    expect(operationSchema.safeParse({ operation: "crop", width: 400, height: 400 }).success).toBe(true);
  });

  it("rejects crop without aspectRatio or full width+height", () => {
    expect(operationSchema.safeParse({ operation: "crop" }).success).toBe(false);
    expect(operationSchema.safeParse({ operation: "crop", width: 400 }).success).toBe(false);
  });

  it("accepts brightness within range and rejects out of range", () => {
    expect(operationSchema.safeParse({ operation: "brightness", value: 50 }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "brightness", value: -100 }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "brightness", value: 150 }).success).toBe(false);
  });

  it("accepts contrast within range and rejects out of range", () => {
    expect(operationSchema.safeParse({ operation: "contrast", value: -30 }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "contrast", value: 101 }).success).toBe(false);
  });

  it("accepts valid sharpen intensities and rejects invented ones", () => {
    expect(operationSchema.safeParse({ operation: "sharpen", intensity: "leve" }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "sharpen", intensity: "médio" }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "sharpen", intensity: "forte" }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "sharpen", intensity: "extra forte" }).success).toBe(false);
  });

  it("accepts valid rotate degrees and rejects others", () => {
    expect(operationSchema.safeParse({ operation: "rotate", degrees: 90 }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "rotate", degrees: 180 }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "rotate", degrees: 270 }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "rotate", degrees: 45 }).success).toBe(false);
  });

  it("accepts compress quality within 1-100 and rejects out of range", () => {
    expect(operationSchema.safeParse({ operation: "compress", quality: 80 }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "compress", quality: 0 }).success).toBe(false);
    expect(operationSchema.safeParse({ operation: "compress", quality: 101 }).success).toBe(false);
  });

  it("accepts valid convertFormat and rejects invented format", () => {
    expect(operationSchema.safeParse({ operation: "convertFormat", format: "webp" }).success).toBe(true);
    expect(operationSchema.safeParse({ operation: "convertFormat", format: "gif" }).success).toBe(false);
  });

  it("accepts removeBackground with no params", () => {
    expect(operationSchema.safeParse({ operation: "removeBackground" }).success).toBe(true);
  });

  it("rejects an operation outside the closed list", () => {
    expect(operationSchema.safeParse({ operation: "invented" }).success).toBe(false);
  });
});

describe("operationsSchema", () => {
  it("rejects an empty list", () => {
    expect(operationsSchema.safeParse([]).success).toBe(false);
  });

  it("accepts a list combining two operations", () => {
    const result = operationsSchema.safeParse([
      { operation: "removeBackground" },
      { operation: "sharpen", intensity: "médio" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a list with more than 5 operations", () => {
    const ops = Array.from({ length: 6 }, () => ({ operation: "rotate", degrees: 90 }));
    expect(operationsSchema.safeParse(ops).success).toBe(false);
  });
});
