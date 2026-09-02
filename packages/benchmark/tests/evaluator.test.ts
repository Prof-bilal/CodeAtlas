import type { TaskDefinition } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { conceptHits, evaluateTask, fileHits } from "../src/evaluator";

// ---------------------------------------------------------------------------
// fileHits
// ---------------------------------------------------------------------------
describe("fileHits", () => {
  it("matches file basenames in text", () => {
    const hits = fileHits(
      ["lib/winston.js", "lib/winston/logger.js"],
      "The entry point is lib/winston.js and the logger is in lib/winston/logger.js",
    );
    expect(hits).toEqual(["lib/winston.js", "lib/winston/logger.js"]);
  });

  it("returns empty when no files found", () => {
    const hits = fileHits(["lib/winston.js"], "No files here");
    expect(hits).toEqual([]);
  });

  it("matches case-insensitively", () => {
    const hits = fileHits(["lib/Console.js"], "Found LIB/CONSOLE.JS");
    expect(hits).toEqual(["lib/Console.js"]);
  });

  it("matches basename tokens when the cited extension differs", () => {
    // Model cites "create logger" prose while the expected file is create-logger.ts
    const hits = fileHits(
      ["lib/winston/create-logger.ts"],
      "The main entry creates loggers via the create logger factory module",
    );
    expect(hits).toEqual(["lib/winston/create-logger.ts"]);
  });

  it("does not token-match unrelated files", () => {
    const hits = fileHits(
      ["lib/winston/container.js"],
      "The transport registry handles daily rotation of log files",
    );
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// conceptHits
// ---------------------------------------------------------------------------
describe("conceptHits", () => {
  it("matches concepts in text", () => {
    const hits = conceptHits(
      ["createLogger", "transports", "formats"],
      "The createLogger function creates a logger with transports and formats",
    );
    expect(hits).toEqual(["createLogger", "transports", "formats"]);
  });

  it("returns empty when no concepts found", () => {
    const hits = conceptHits(["auth", "middleware"], "No matching concepts");
    expect(hits).toEqual([]);
  });

  it("normalizes underscores and hyphens", () => {
    const hits = conceptHits(["error_handler"], "The error-handler class handles errors");
    expect(hits).toEqual(["error_handler"]);
  });

  it("fuzzy-matches concept word variants (handler ≈ handling)", () => {
    const hits = conceptHits(
      ["error handler", "request validation"],
      "The error-handling middleware performs request validation before routing",
    );
    expect(hits).toEqual(["error handler", "request validation"]);
  });

  it("does not fuzzy-match unrelated short tokens", () => {
    const hits = conceptHits(["user auth"], "The cart total uses a sale price");
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// evaluateTask
// ---------------------------------------------------------------------------
describe("evaluateTask", () => {
  const task: TaskDefinition = {
    id: "T01",
    category: "repository-understanding",
    prompt: "Explain the architecture",
    expected_files: ["lib/winston.js", "lib/winston/logger.js"],
    expected_concepts: ["createLogger", "transports"],
    evaluation_method: "Manual review",
  };

  it("scores 2 (correct) when both ratios >= 0.5", () => {
    const result = evaluateTask(
      task,
      "The createLogger function in lib/winston.js creates a logger. Transports are used for output.",
      [],
      "/nonexistent",
    );
    expect(result.score).toBe(2);
    expect(result.status).toBe("correct");
    expect(result.fileRatio).toBeGreaterThanOrEqual(0.5);
    expect(result.conceptRatio).toBeGreaterThanOrEqual(0.5);
  });

  it("scores 1 (partial) when one ratio >= 0.2", () => {
    const result = evaluateTask(
      task,
      "The createLogger function is the entry point.",
      [],
      "/nonexistent",
    );
    expect(result.score).toBe(1);
    expect(result.status).toBe("partially_correct");
  });

  it("caps timed-out runs at 0 (failed) even with file evidence in the transcript", () => {
    const result = evaluateTask(
      task,
      "The createLogger function in lib/winston.js creates a logger. Transports are used for output.",
      [],
      "/nonexistent",
      { timedOut: true },
    );
    expect(result.score).toBe(0);
    expect(result.status).toBe("failed");
    // Evidence stays as diagnostics but earns no credit.
    expect(result.filesFound).toContain("lib/winston.js");
  });

  it("does not cap non-timed-out runs when the timedOut option is absent or false", () => {
    const text =
      "The createLogger function in lib/winston.js creates a logger. Transports are used for output.";
    expect(evaluateTask(task, text, [], "/nonexistent").score).toBe(2);
    expect(evaluateTask(task, text, [], "/nonexistent", { timedOut: false }).score).toBe(2);
  });

  it("scores 0 (incorrect) when response is long but ratios are low", () => {
    const result = evaluateTask(
      task,
      "This is a long response about something completely unrelated to the expected files and concepts.",
      [],
      "/nonexistent",
    );
    expect(result.score).toBe(0);
    expect(result.status).toBe("incorrect");
  });

  it("scores 0 (failed) when response is empty", () => {
    const result = evaluateTask(task, "", [], "/nonexistent");
    expect(result.score).toBe(0);
    expect(result.status).toBe("failed");
  });

  it("includes found files and concepts", () => {
    const result = evaluateTask(
      task,
      "createLogger in lib/winston.js and transports",
      [],
      "/nonexistent",
    );
    expect(result.filesFound).toContain("lib/winston.js");
    expect(result.conceptsFound).toContain("createLogger");
    expect(result.conceptsFound).toContain("transports");
  });
});
