import type { Symbol } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";
import { describe, expect, it } from "vitest";
import { ParserService } from "../src/parser.service";
import { GO_CONFIG } from "../src/treesitter/languages/go";
import { PYTHON_CONFIG } from "../src/treesitter/languages/python";
import { TreeSitterParser } from "../src/treesitter/tree-sitter-parser";
import type { ParsedFile } from "../src/parsed-file";

async function parse(config: typeof PYTHON_CONFIG, path: string, content: string) {
  const parser = new TreeSitterParser(config);
  const result = await parser.parse({ path: path as FilePath, language: config.language, content });
  if (!result.ok) {
    throw new Error(`parse failed: ${result.error.message}`);
  }
  return result.value;
}

function named(file: ParsedFile, name: string): Symbol | undefined {
  return file.symbols.find((symbol) => symbol.name === name);
}

const PYTHON_SOURCE = `"""Module docstring."""
import os
from .utils import helper as h

CONSTANT = 42
_private = 1

class Service:
    """A service."""

    def __init__(self, name: str) -> None:
        self.name = name

    def start(self) -> None:
        h(CONSTANT)


def top(x: int) -> int:
    return helper(x)
`;

describe("tree-sitter Python", () => {
  it("extracts functions, classes, methods, constants, and imports", async () => {
    const file = await parse(PYTHON_CONFIG, "/repo/app.py", PYTHON_SOURCE);

    const service = named(file, "Service")!;
    expect(service.kind).toBe("class");
    expect(service.exported).toBe(true);
    expect(service.documentation).toBe("A service.");

    const start = named(file, "start")!;
    expect(start.kind).toBe("method");
    expect(start.parentId).toBe(service.id);
    expect(start.visibility).toBe("public");

    const init = named(file, "__init__")!;
    expect(init.kind).toBe("method");
    expect(init.visibility).toBe("private");

    const top = named(file, "top")!;
    expect(top.kind).toBe("function");
    expect(top.exported).toBe(true);

    const constant = named(file, "CONSTANT")!;
    expect(constant.kind).toBe("constant");
    expect(constant.exported).toBe(true);

    const priv = named(file, "_private")!;
    expect(priv.exported).toBe(false);

    const osImport = named(file, "os")!;
    expect(osImport.kind).toBe("import");
    expect(osImport.moduleSpecifier).toBe("os");

    const aliased = named(file, "h")!;
    expect(aliased.kind).toBe("import");
    expect(aliased.moduleSpecifier).toBe(".utils");
    expect(aliased.importedName).toBe("helper");
  });

  it("resolves same-file usages of imports and constants", async () => {
    const file = await parse(PYTHON_CONFIG, "/repo/app.py", PYTHON_SOURCE);
    const hRef = file.references.find((ref) => ref.name === "h")!;
    expect(hRef.kind).toBe("call");
    expect(hRef.targetSymbolId).toBe(named(file, "h")!.id);

    const constantRef = file.references.find((ref) => ref.name === "CONSTANT")!;
    expect(constantRef.targetSymbolId).toBe(named(file, "CONSTANT")!.id);
  });

  it("does not throw on malformed Python", async () => {
    const parser = new TreeSitterParser(PYTHON_CONFIG);
    const result = await parser.parse({
      path: "/repo/broken.py" as FilePath,
      language: "python",
      content: "def (:\n  ???\n",
    });
    expect(result.ok).toBe(true);
  });
});

const GO_SOURCE = `package demo

import (
	"fmt"
	helper "example.com/util"
)

const MaxSize = 10

var count int

type Service struct {
	Name string
	size int
}

func NewService() *Service {
	return &Service{Name: "x"}
}

func (s *Service) Start() {
	fmt.Println(s.Name, helper.Do())
}
`;

describe("tree-sitter Go", () => {
  it("extracts structs, fields, functions, methods, constants, and imports", async () => {
    const file = await parse(GO_CONFIG, "/repo/app.go", GO_SOURCE);

    const service = named(file, "Service")!;
    expect(service.kind).toBe("struct");
    expect(service.exported).toBe(true);

    const nameField = file.symbols.find((s) => s.name === "Name" && s.kind === "property")!;
    expect(nameField.parentId).toBe(service.id);
    expect(nameField.visibility).toBe("public");

    const sizeField = file.symbols.find((s) => s.name === "size" && s.kind === "property")!;
    expect(sizeField.visibility).toBe("private");

    const newService = named(file, "NewService")!;
    expect(newService.kind).toBe("function");
    expect(newService.exported).toBe(true);

    const start = file.symbols.find((s) => s.name === "Start" && s.kind === "method")!;
    expect(start.exported).toBe(true);

    const maxSize = named(file, "MaxSize")!;
    expect(maxSize.kind).toBe("constant");

    const count = named(file, "count")!;
    expect(count.kind).toBe("variable");
    expect(count.exported).toBe(false);

    const fmtImport = named(file, "fmt")!;
    expect(fmtImport.kind).toBe("import");
    expect(fmtImport.moduleSpecifier).toBe("fmt");

    const helperImport = named(file, "helper")!;
    expect(helperImport.moduleSpecifier).toBe("example.com/util");
  });

  it("resolves same-file usages and classifies constructs", async () => {
    const file = await parse(GO_CONFIG, "/repo/app.go", GO_SOURCE);
    const serviceRef = file.references.find(
      (ref) => ref.name === "Service" && ref.kind === "construct",
    )!;
    expect(serviceRef.targetSymbolId).toBe(named(file, "Service")!.id);

    const fmtRef = file.references.find((ref) => ref.name === "fmt")!;
    expect(fmtRef.targetSymbolId).toBe(named(file, "fmt")!.id);
  });

  it("does not throw on malformed Go", async () => {
    const parser = new TreeSitterParser(GO_CONFIG);
    const result = await parser.parse({
      path: "/repo/broken.go" as FilePath,
      language: "go",
      content: "package demo\nfunc (\n",
    });
    expect(result.ok).toBe(true);
  });
});

describe("ParserService tree-sitter registration", () => {
  it("advertises python and go and parses them through the service", async () => {
    const service = new ParserService();
    expect(service.supportedLanguages()).toEqual(
      expect.arrayContaining(["typescript", "javascript", "python", "go"]),
    );
    const batch = await service.parseFiles([
      { path: "/repo/a.py" as FilePath, language: "python", content: "def f():\n    pass\n" },
      { path: "/repo/b.go" as FilePath, language: "go", content: "package b\nfunc G() {}\n" },
    ]);
    expect(batch.skipped).toHaveLength(0);
    expect(batch.parsed).toHaveLength(2);
    expect(batch.parsed[0]!.symbols.some((s) => s.name === "f")).toBe(true);
    expect(batch.parsed[1]!.symbols.some((s) => s.name === "G")).toBe(true);
  });
});
