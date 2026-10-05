import type { FilePath } from "@prof-bilal/atlas-shared";
import { describe, expect, it } from "vitest";
import { CSHARP_CONFIG } from "../src/treesitter/languages/csharp";
import { JAVA_CONFIG } from "../src/treesitter/languages/java";
import { RUST_CONFIG } from "../src/treesitter/languages/rust";
import type { TreeSitterLanguageConfig } from "../src/treesitter/language-config";
import { TreeSitterParser } from "../src/treesitter/tree-sitter-parser";

async function parse(config: TreeSitterLanguageConfig, path: string, content: string) {
  const parser = new TreeSitterParser(config);
  const result = await parser.parse({ path: path as FilePath, language: config.language, content });
  if (!result.ok) {
    throw new Error(`parse failed: ${result.error.message}`);
  }
  return result.value;
}

const JAVA = `package com.example;

import java.util.List;

public class Service {
    private final String name;

    public Service(String name) {
        this.name = name;
    }

    public int start(int x) {
        return helper(x);
    }
}

interface Shape {
    int area();
}
`;

describe("tree-sitter Java", () => {
  it("extracts classes, interfaces, methods, constructors, fields, and imports", async () => {
    const file = await parse(JAVA_CONFIG, "/repo/Service.java", JAVA);
    const klass = file.symbols.find((s) => s.name === "Service" && s.kind === "class")!;
    expect(klass.exported).toBe(true);

    const field = file.symbols.find((s) => s.name === "name" && s.kind === "property")!;
    expect(field.parentId).toBe(klass.id);
    expect(field.visibility).toBe("private");

    const ctor = file.symbols.find((s) => s.kind === "constructor")!;
    expect(ctor.name).toBe("Service");

    const start = file.symbols.find((s) => s.name === "start" && s.kind === "method")!;
    expect(start.visibility).toBe("public");

    const shape = file.symbols.find((s) => s.name === "Shape")!;
    expect(shape.kind).toBe("interface");

    const listImport = file.symbols.find((s) => s.kind === "import")!;
    expect(listImport.moduleSpecifier).toContain("java.util.List");
  });
});

const CSHARP = `using System;
using System.Collections.Generic;

namespace Demo {
    public class Service {
        private string name;

        public Service(string name) {
            this.name = name;
        }

        public int Start(int x) {
            return x;
        }
    }

    public struct Point {
        public int X;
    }
}
`;

describe("tree-sitter C#", () => {
  it("extracts namespaces, classes, structs, methods, and using directives", async () => {
    const file = await parse(CSHARP_CONFIG, "/repo/Service.cs", CSHARP);
    const ns = file.symbols.find((s) => s.name === "Demo")!;
    expect(ns.kind).toBe("namespace");

    const klass = file.symbols.find((s) => s.name === "Service" && s.kind === "class")!;
    expect(klass.exported).toBe(true);

    const field = file.symbols.find((s) => s.name === "name" && s.kind === "property")!;
    expect(field.visibility).toBe("private");

    const start = file.symbols.find((s) => s.name === "Start" && s.kind === "method")!;
    expect(start.visibility).toBe("public");

    const point = file.symbols.find((s) => s.name === "Point")!;
    expect(point.kind).toBe("struct");

    const using = file.symbols.find((s) => s.kind === "import" && s.moduleSpecifier === "System")!;
    expect(using).toBeDefined();
  });
});

const RUST = `use std::collections::HashMap;
use crate::util as u;

pub const MAX: usize = 10;

pub struct Service {
    pub name: String,
    size: usize,
}

impl Service {
    pub fn start(&self) -> usize {
        MAX
    }
}

pub trait Shape {
    fn area(&self) -> usize;
}

pub enum Mode {
    Fast,
    Slow,
}
`;

describe("tree-sitter Rust", () => {
  it("extracts structs, traits, enums, functions, constants, and use declarations", async () => {
    const file = await parse(RUST_CONFIG, "/repo/lib.rs", RUST);

    const max = file.symbols.find((s) => s.name === "MAX")!;
    expect(max.kind).toBe("constant");
    expect(max.exported).toBe(true);

    const service = file.symbols.find((s) => s.name === "Service" && s.kind === "struct")!;
    expect(service.exported).toBe(true);

    const method = file.symbols.find((s) => s.name === "start" && s.kind === "method")!;
    expect(method.exported).toBe(true);

    const trait = file.symbols.find((s) => s.name === "Shape")!;
    expect(trait.kind).toBe("trait");

    const mode = file.symbols.find((s) => s.name === "Mode")!;
    expect(mode.kind).toBe("enum");

    const fast = file.symbols.find((s) => s.name === "Fast")!;
    expect(fast.kind).toBe("enum-member");

    const imports = file.symbols.filter((s) => s.kind === "import");
    expect(imports.map((s) => s.name)).toEqual(expect.arrayContaining(["HashMap", "u"]));
  });
});
