import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "../src/zod-to-json-schema";

describe("zodToJsonSchema", () => {
  it("converts a basic string", () => {
    const schema = zodToJsonSchema(z.string());
    expect(schema).toEqual({ type: "string" });
  });

  it("converts a string with max length", () => {
    const schema = zodToJsonSchema(z.string().max(100));
    expect(schema).toEqual({ type: "string", maxLength: 100 });
  });

  it("converts a number", () => {
    const schema = zodToJsonSchema(z.number());
    expect(schema).toEqual({ type: "number" });
  });

  it("converts an integer with bounds", () => {
    const schema = zodToJsonSchema(z.number().int().min(1).max(100));
    expect(schema).toEqual({ type: "integer", minimum: 1, maximum: 100 });
  });

  it("converts a boolean", () => {
    const schema = zodToJsonSchema(z.boolean());
    expect(schema).toEqual({ type: "boolean" });
  });

  it("converts an enum", () => {
    const schema = zodToJsonSchema(z.enum(["a", "b", "c"]));
    expect(schema).toEqual({ type: "string", enum: ["a", "b", "c"] });
  });

  it("converts an array", () => {
    const schema = zodToJsonSchema(z.array(z.string()));
    expect(schema).toEqual({ type: "array", items: { type: "string" } });
  });

  it("converts an object with required and optional fields", () => {
    const schema = zodToJsonSchema(
      z.object({
        name: z.string().describe("The name"),
        limit: z.number().optional(),
      }),
    );
    expect(schema).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        limit: { type: "number" },
      },
      required: ["name"],
    });
  });

  it("converts a record", () => {
    const schema = zodToJsonSchema(z.record(z.string(), z.number()));
    expect(schema).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });

  it("converts nullable fields", () => {
    const schema = zodToJsonSchema(z.string().nullable());
    expect(schema).toEqual({ type: "string", nullable: true });
  });

  it("converts nested objects", () => {
    const schema = zodToJsonSchema(
      z.object({
        location: z.object({ startLine: z.number(), endLine: z.number() }),
      }),
    );
    expect(schema).toEqual({
      type: "object",
      properties: {
        location: {
          type: "object",
          properties: {
            startLine: { type: "number" },
            endLine: { type: "number" },
          },
          required: ["startLine", "endLine"],
        },
      },
      required: ["location"],
    });
  });

  it("converts an array of objects", () => {
    const schema = zodToJsonSchema(z.array(z.object({ id: z.string(), name: z.string() })));
    expect(schema).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        required: ["id", "name"],
      },
    });
  });

  it("handles z.any()", () => {
    const schema = zodToJsonSchema(z.any());
    expect(schema).toEqual({});
  });

  it("converts actual tool schemas from tools.ts", () => {
    const searchSymbolsInput = z.object({
      query: z.string().max(10000).describe("Symbol name or fragment to search for."),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of hits."),
      kind: z
        .enum(["class", "function", "method", "variable"])
        .optional()
        .describe("Restrict to a kind."),
      minScore: z.number().min(0).optional().describe("Drop hits below this score."),
    });
    const schema = zodToJsonSchema(searchSymbolsInput);
    expect(schema).toEqual({
      type: "object",
      properties: {
        query: { type: "string", maxLength: 10000 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        kind: { type: "string", enum: ["class", "function", "method", "variable"] },
        minScore: { type: "number", minimum: 0 },
      },
      required: ["query"],
    });
  });
});
