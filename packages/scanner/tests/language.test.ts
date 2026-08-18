import { describe, expect, it } from "vitest";
import { LANGUAGE_BY_EXTENSION, detectLanguageByName, extensionOf } from "../src/language";

describe("extensionOf", () => {
  it("extracts the lowercased extension after the last dot", () => {
    expect(extensionOf("index.ts")).toBe("ts");
    expect(extensionOf("src/folder/App.TSX")).toBe("tsx");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
  });

  it("returns null for files without an extension", () => {
    expect(extensionOf("Dockerfile")).toBeNull();
    expect(extensionOf("Makefile")).toBeNull();
    expect(extensionOf(".gitignore")).toBeNull();
  });
});

describe("detectLanguageByName", () => {
  it("maps well-known extensions to languages", () => {
    expect(detectLanguageByName("index.ts")).toBe("typescript");
    expect(detectLanguageByName("App.jsx")).toBe("javascript");
    expect(detectLanguageByName("main.py")).toBe("python");
    expect(detectLanguageByName("style.css")).toBe("css");
    expect(detectLanguageByName("README.md")).toBe("markdown");
  });

  it("detects well-known filenames without an extension", () => {
    expect(detectLanguageByName("Dockerfile")).toBe("docker");
    expect(detectLanguageByName("Makefile")).toBe("make");
  });

  it("returns null for unknown extensions and dotfiles", () => {
    expect(detectLanguageByName("file.xyz")).toBeNull();
    expect(detectLanguageByName(".env")).toBeNull();
  });

  it("exposes a non-trivial extension table", () => {
    expect(Object.keys(LANGUAGE_BY_EXTENSION).length).toBeGreaterThan(40);
  });
});
