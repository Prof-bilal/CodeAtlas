import type { ContextSnapshot, SourceFile, Symbol as PersistedSymbol } from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { LexicalScorer } from "../src/scoring";
import { SearchService } from "../src/search.service";

function file(path: string, content = ""): SourceFile {
  return { path: path as FilePath, language: "typescript", content };
}

function symbol(
  id: string,
  name: string,
  filePath: string,
  documentation: string | null = null,
): PersistedSymbol {
  return {
    id: id as SymbolId,
    name,
    kind: "function",
    filePath: filePath as FilePath,
    location: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 },
    parentId: null,
    visibility: "exported",
    exported: true,
    modifiers: ["export"],
    moduleSpecifier: null,
    typeText: null,
    documentation,
  };
}

function snapshot(files: SourceFile[], symbols: PersistedSymbol[]): ContextSnapshot {
  return {
    version: 1,
    savedAt: "2026-09-06T00:00:00.000Z",
    files,
    symbols,
  };
}

describe("conjunction coverage (F1)", () => {
  it("ranks an entity matching every query term above one matching a single term best", () => {
    const service = new SearchService();
    service.indexSnapshot(
      snapshot(
        [
          file("/src/password-reset.ts", "function resetPassword() {}"),
          file("/src/password.ts", "function login() {}"),
        ],
        [
          symbol("s1", "resetPassword", "/src/password-reset.ts", "Resets the user password."),
          symbol("s2", "validatePassword", "/src/password.ts", "Validates a password."),
        ],
      ),
    );

    // "password reset routes": resetPassword matches "password" (doc) and
    // "reset" (name) — 2/3 terms; validatePassword matches only "password".
    const hits = service.search("password reset routes", { types: ["symbol"] });
    expect(hits[0]?.title).toBe("resetPassword");
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 0);
  });

  it("full coverage keeps the exact-match ceiling (no phantom re-scaling)", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot([], [symbol("s1", "UserRepository", "/src/users.ts", null)]));

    // Single strong identifier query — exact still hits 100.
    expect(service.search("UserRepository", { types: ["symbol"] })[0]?.score).toBe(100);
  });

  it("still retrieves a best-term-only entity (not silenced by partial coverage)", () => {
    const service = new SearchService();
    service.indexSnapshot(
      snapshot([], [symbol("s1", "login", "/src/auth.ts", "Authenticates a user.")]),
    );
    // Only one meaningful term matches ("login"), others don't. Entity must
    // still surface, just damped.
    const hits = service.search("login handler user", { types: ["symbol"] });
    expect(hits.some((hit) => hit.title === "login")).toBe(true);
  });

  it("applies an exact-phrase-substring bonus over scattered term matches", () => {
    const service = new SearchService();
    service.indexSnapshot(
      snapshot(
        [
          // scattered: contains "password" and "reset" but not contiguously
          file("/src/a.ts", "function handlePassword() { reset(); }"),
          // contiguous phrase in content
          file("/src/b.ts", "function run() { /* password reset handler */ }"),
        ],
        [],
      ),
    );
    const hits = service.search("password reset handler", { types: ["file"] });
    // b.ts contains the whole normalized phrase contiguously; a.ts only the
    // two scattered terms. Phrase bonus should push b.ts ahead.
    expect(hits[0]?.title).toBe("/src/b.ts");
  });

  it("coverage never lets a partial match outrank a full-coverage exact symbol", () => {
    const service = new SearchService();
    service.indexSnapshot(
      snapshot(
        [],
        [
          symbol("s1", "createUser", "/src/users.ts", "Creates a user record."),
          symbol("s2", "UserRoutes", "/src/routes.ts", "Routes for the user API."),
        ],
      ),
    );
    // "create user" — createUser matches both terms (name "createUser" is one
    // token, but "create" prefix-matches and "user" substrings). UserRoutes
    // matches only "user". createUser must lead.
    const hits = service.search("create user", { types: ["symbol"] });
    expect(hits[0]?.title).toBe("createUser");
  });
});

describe("scorer unit invariants", () => {
  const scorer = new LexicalScorer();
  const entity = {
    kind: "symbol" as const,
    id: "s1",
    name: "passwordReset",
    symbolKind: "function",
    filePath: "/src/password.ts",
    documentation: "Resets a password.",
  };

  it("single-term query keeps the exact ceiling at 100", () => {
    expect(scorer.score("passwordReset", entity, true)).toBe(100);
  });

  it("multi-term full coverage stays at the best term's level", () => {
    // Both "password" and "reset" match the name field; coverage 2/2 = 1.0.
    const score = scorer.score("password reset", entity, true);
    expect(score).toBeGreaterThanOrEqual(75); // TOKEN level for the whole token
    expect(score).toBeLessThanOrEqual(100);
  });

  it("phrase-substring bonus caps at the exact ceiling", () => {
    // The name is a single camelCase token; the contiguous query "password
    // reset" is not literally inside it, so exercise the bonus via content.
    const fileEntity = {
      kind: "file" as const,
      path: "/src/a.ts",
      language: "typescript",
      content: "// password reset flow\nfunction x() {}",
    };
    const score = scorer.score("password reset", fileEntity, false);
    // content is damped by 0.4 in the file scorer, but the raw field-level
    // phrase bonus is applied before the file damp. Assert it stays ≤ exact.
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThan(0);
  });
});
