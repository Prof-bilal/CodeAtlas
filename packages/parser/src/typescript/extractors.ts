import { Node } from "ts-morph";
import type {
  ClassDeclaration,
  ConstructorDeclaration,
  EnumDeclaration,
  EnumMember,
  ExportAssignment,
  ExportDeclaration,
  FunctionDeclaration,
  ImportDeclaration,
  InterfaceDeclaration,
  SourceFile as MorphSourceFile,
  TypeAliasDeclaration,
  VariableStatement,
} from "ts-morph";
import type { Symbol, SymbolKind, Visibility } from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";
import { documentationOf, locationOf } from "../position";
import { createSymbolId } from "../symbol-id";

/** Inputs used to build one normalized {@link Symbol}. */
interface SymbolInput {
  readonly name: string;
  readonly kind: SymbolKind;
  /** The AST node used to derive the symbol's source span. */
  readonly node: Node;
  readonly parentId?: SymbolId | null;
  readonly visibility?: Visibility;
  readonly exported?: boolean;
  readonly modifiers?: readonly string[];
  readonly moduleSpecifier?: string | null;
  readonly importedName?: string;
  readonly typeText?: string | null;
}

/**
 * Extract every extractable declaration from a ts-morph source file into
 * normalized, language-agnostic symbols.
 *
 * Statements are walked in source order so the returned array is in
 * declaration order. Parent/child relationships (a method to its class, an
 * enum member to its enum) are expressed through `parentId`.
 */
export function extractSymbols(sourceFile: MorphSourceFile, filePath: FilePath): Symbol[] {
  const symbols: Symbol[] = [];

  for (const statement of sourceFile.getStatements()) {
    if (Node.isImportDeclaration(statement)) {
      extractImport(sourceFile, filePath, statement, symbols);
    } else if (Node.isExportDeclaration(statement)) {
      extractExportDeclaration(sourceFile, filePath, statement, symbols);
    } else if (Node.isExportAssignment(statement)) {
      extractExportAssignment(sourceFile, filePath, statement, symbols);
    } else if (Node.isClassDeclaration(statement)) {
      extractClass(sourceFile, filePath, statement, symbols);
    } else if (Node.isInterfaceDeclaration(statement)) {
      extractInterface(sourceFile, filePath, statement, symbols);
    } else if (Node.isFunctionDeclaration(statement)) {
      extractFunction(sourceFile, filePath, statement, symbols);
    } else if (Node.isEnumDeclaration(statement)) {
      extractEnum(sourceFile, filePath, statement, symbols);
    } else if (Node.isTypeAliasDeclaration(statement)) {
      extractTypeAlias(sourceFile, filePath, statement, symbols);
    } else if (Node.isVariableStatement(statement)) {
      extractVariables(sourceFile, filePath, statement, symbols);
    }
    // Other statements (namespaces, bare expressions, ...) are not extracted.
  }

  return symbols;
}

function extractImport(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  declaration: ImportDeclaration,
  symbols: Symbol[],
): void {
  const moduleSpecifier = declaration.getModuleSpecifierValue();
  const clause = declaration.getImportClause();
  const baseModifiers = clause?.isTypeOnly() === true ? ["type"] : [];

  const defaultImport = clause?.getDefaultImport();
  if (defaultImport !== undefined) {
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: defaultImport.getText(),
        kind: "import",
        node: defaultImport,
        modifiers: [...baseModifiers, "default"],
        moduleSpecifier,
        importedName: "default",
      }),
    );
  }

  const namespaceImport = clause?.getNamespaceImport();
  if (namespaceImport !== undefined) {
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: namespaceImport.getText(),
        kind: "import",
        node: namespaceImport,
        modifiers: [...baseModifiers, "namespace"],
        moduleSpecifier,
        importedName: "*",
      }),
    );
  }

  for (const specifier of declaration.getNamedImports()) {
    const alias = specifier.getAliasNode()?.getText();
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: alias ?? specifier.getName(),
        kind: "import",
        node: specifier,
        modifiers: [...baseModifiers, alias === undefined ? "named" : "renamed"],
        moduleSpecifier,
        importedName: specifier.getName(),
      }),
    );
  }

  // A bare `import "module"` (side-effect import) has no import clause.
  if (clause === undefined) {
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: moduleSpecifier,
        kind: "import",
        node: declaration,
        modifiers: ["side-effect"],
        moduleSpecifier,
      }),
    );
  }
}

function extractExportDeclaration(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  declaration: ExportDeclaration,
  symbols: Symbol[],
): void {
  const moduleSpecifier = declaration.getModuleSpecifierValue();
  const baseModifiers: string[] = [];
  if (declaration.isTypeOnly()) {
    baseModifiers.push("type");
  }
  if (moduleSpecifier !== undefined) {
    baseModifiers.push("re-export");
  }

  // `export * as ns from "module"`. `isNamespaceExport()` also matches plain
  // star exports, so gate on the namespace export node being present instead.
  const namespaceExport = declaration.getNamespaceExport();
  if (namespaceExport !== undefined) {
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: namespaceExport.getName(),
        kind: "export",
        node: declaration,
        visibility: "exported",
        exported: true,
        modifiers: [...baseModifiers, "namespace"],
        moduleSpecifier: moduleSpecifier ?? null,
      }),
    );
    return;
  }

  // `export * from "module"`
  if (moduleSpecifier !== undefined && declaration.getNamedExports().length === 0) {
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: "*",
        kind: "export",
        node: declaration,
        visibility: "exported",
        exported: true,
        modifiers: [...baseModifiers, "star"],
        moduleSpecifier,
      }),
    );
    return;
  }

  // `export { a, b as c }`, optionally re-exported via `from "module"`.
  // Unlike imports, `getName()` is the *local* name and `getAliasNode()` is
  // the externally exported name.
  for (const exportSpecifier of declaration.getNamedExports()) {
    const alias = exportSpecifier.getAliasNode()?.getText();
    const localName = exportSpecifier.getName();
    const exportedName = alias ?? localName;
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: exportedName,
        kind: "export",
        node: exportSpecifier,
        visibility: "exported",
        exported: true,
        modifiers: [...baseModifiers, alias === undefined ? "local" : "renamed"],
        moduleSpecifier: moduleSpecifier ?? null,
      }),
    );
  }
}

function extractExportAssignment(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  assignment: ExportAssignment,
  symbols: Symbol[],
): void {
  const isExportEquals = assignment.isExportEquals();
  symbols.push(
    buildSymbol(sourceFile, filePath, {
      name: isExportEquals ? "export=" : "default",
      kind: "export",
      node: assignment,
      visibility: "exported",
      exported: true,
      modifiers: isExportEquals ? ["assignment", "export-equals"] : ["assignment", "default"],
      moduleSpecifier: null,
    }),
  );
}

function extractClass(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  declaration: ClassDeclaration,
  symbols: Symbol[],
): void {
  const modifiers = declaration.getModifiers().map((modifier) => modifier.getText());
  const classSymbol = buildSymbol(sourceFile, filePath, {
    name: declaration.getName() ?? "default",
    kind: "class",
    node: declaration,
    visibility: visibilityForModule(modifiers),
    exported: modifiers.includes("export"),
    modifiers,
  });
  symbols.push(classSymbol);

  // Members are walked in source order (methods, properties, constructors, and
  // accessors interleaved as written) so children appear in declaration order.
  for (const member of declaration.getMembers()) {
    if (Node.isMethodDeclaration(member)) {
      const methodModifiers = member.getModifiers().map((modifier) => modifier.getText());
      symbols.push(
        buildSymbol(sourceFile, filePath, {
          name: member.getName(),
          kind: "method",
          node: member,
          parentId: classSymbol.id,
          visibility: visibilityForMember(methodModifiers),
          modifiers: methodModifiers,
        }),
      );
    } else if (Node.isPropertyDeclaration(member)) {
      const propertyModifiers = member.getModifiers().map((modifier) => modifier.getText());
      symbols.push(
        buildSymbol(sourceFile, filePath, {
          name: member.getName(),
          kind: "property",
          node: member,
          parentId: classSymbol.id,
          visibility: visibilityForMember(propertyModifiers),
          modifiers: propertyModifiers,
          typeText: typeTextOf(member),
        }),
      );
    } else if (Node.isConstructorDeclaration(member)) {
      extractConstructor(sourceFile, filePath, member, classSymbol, symbols);
    } else if (Node.isGetAccessorDeclaration(member) || Node.isSetAccessorDeclaration(member)) {
      const accessorModifiers = member.getModifiers().map((modifier) => modifier.getText());
      symbols.push(
        buildSymbol(sourceFile, filePath, {
          name: member.getName(),
          kind: "property",
          node: member,
          parentId: classSymbol.id,
          visibility: visibilityForMember(accessorModifiers),
          modifiers: [...accessorModifiers, "accessor"],
        }),
      );
    }
  }
}

function extractConstructor(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  constructor: ConstructorDeclaration,
  classSymbol: Symbol,
  symbols: Symbol[],
): void {
  const modifiers = constructor.getModifiers().map((modifier) => modifier.getText());
  symbols.push(
    buildSymbol(sourceFile, filePath, {
      name: "constructor",
      kind: "constructor",
      node: constructor,
      parentId: classSymbol.id,
      visibility: visibilityForMember(modifiers),
      modifiers,
    }),
  );

  // Parameter properties (`constructor(public id: string)`) become class
  // members; they are surfaced here as properties of the class.
  for (const parameter of constructor.getParameters()) {
    if (!parameter.isParameterProperty()) {
      continue;
    }
    const parameterModifiers = parameter.getModifiers().map((modifier) => modifier.getText());
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: parameter.getName(),
        kind: "property",
        node: parameter,
        parentId: classSymbol.id,
        visibility: visibilityForMember(parameterModifiers),
        modifiers: [...parameterModifiers, "parameter-property"],
        typeText: typeTextOf(parameter),
      }),
    );
  }
}

function extractInterface(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  declaration: InterfaceDeclaration,
  symbols: Symbol[],
): void {
  const modifiers = declaration.getModifiers().map((modifier) => modifier.getText());
  const interfaceSymbol = buildSymbol(sourceFile, filePath, {
    name: declaration.getName(),
    kind: "interface",
    node: declaration,
    visibility: visibilityForModule(modifiers),
    exported: modifiers.includes("export"),
    modifiers,
  });
  symbols.push(interfaceSymbol);

  for (const member of declaration.getMembers()) {
    if (Node.isMethodSignature(member)) {
      symbols.push(
        buildSymbol(sourceFile, filePath, {
          name: member.getName(),
          kind: "method",
          node: member,
          parentId: interfaceSymbol.id,
          visibility: "public",
          // Method signatures cannot carry modifiers.
          modifiers: [],
          typeText: member.getReturnTypeNode()?.getText() ?? null,
        }),
      );
    } else if (Node.isPropertySignature(member)) {
      const propertyModifiers = member.getModifiers().map((modifier) => modifier.getText());
      symbols.push(
        buildSymbol(sourceFile, filePath, {
          name: member.getName(),
          kind: "property",
          node: member,
          parentId: interfaceSymbol.id,
          visibility: "public",
          modifiers: propertyModifiers,
          typeText: member.getTypeNode()?.getText() ?? null,
        }),
      );
    }
  }
}

function extractFunction(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  declaration: FunctionDeclaration,
  symbols: Symbol[],
): void {
  const modifiers = declaration.getModifiers().map((modifier) => modifier.getText());
  symbols.push(
    buildSymbol(sourceFile, filePath, {
      name: declaration.getName() ?? "default",
      kind: "function",
      node: declaration,
      visibility: visibilityForModule(modifiers),
      exported: modifiers.includes("export"),
      modifiers,
    }),
  );
}

function extractEnum(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  declaration: EnumDeclaration,
  symbols: Symbol[],
): void {
  const modifiers = declaration.getModifiers().map((modifier) => modifier.getText());
  const enumSymbol = buildSymbol(sourceFile, filePath, {
    name: declaration.getName(),
    kind: "enum",
    node: declaration,
    visibility: visibilityForModule(modifiers),
    exported: modifiers.includes("export"),
    modifiers,
  });
  symbols.push(enumSymbol);

  for (const member of declaration.getMembers()) {
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: member.getName(),
        kind: "enum-member",
        node: member,
        parentId: enumSymbol.id,
        modifiers: [],
        typeText: enumMemberValue(member),
      }),
    );
  }
}

function extractTypeAlias(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  declaration: TypeAliasDeclaration,
  symbols: Symbol[],
): void {
  const modifiers = declaration.getModifiers().map((modifier) => modifier.getText());
  symbols.push(
    buildSymbol(sourceFile, filePath, {
      name: declaration.getName(),
      kind: "type-alias",
      node: declaration,
      visibility: visibilityForModule(modifiers),
      exported: modifiers.includes("export"),
      modifiers,
      typeText: declaration.getTypeNode()?.getText() ?? null,
    }),
  );
}

function extractVariables(
  sourceFile: MorphSourceFile,
  filePath: FilePath,
  statement: VariableStatement,
  symbols: Symbol[],
): void {
  const modifiers = statement.getModifiers().map((modifier) => modifier.getText());
  const declarationKind = statement.getDeclarationKind();
  const exported = modifiers.includes("export");

  for (const declaration of statement.getDeclarations()) {
    symbols.push(
      buildSymbol(sourceFile, filePath, {
        name: declaration.getName(),
        kind: declarationKind === "const" ? "constant" : "variable",
        node: declaration,
        visibility: visibilityForModule(modifiers),
        exported,
        modifiers: [...modifiers, declarationKind],
        typeText: typeTextOf(declaration),
      }),
    );
  }
}

function buildSymbol(sourceFile: MorphSourceFile, filePath: FilePath, input: SymbolInput): Symbol {
  const location = locationOf(sourceFile, input.node);
  return {
    id: createSymbolId(filePath, input.name, location),
    name: input.name,
    kind: input.kind,
    filePath,
    location,
    parentId: input.parentId ?? null,
    visibility: input.visibility ?? "local",
    exported: input.exported ?? false,
    modifiers: input.modifiers ?? [],
    moduleSpecifier: input.moduleSpecifier ?? null,
    ...(input.importedName === undefined ? {} : { importedName: input.importedName }),
    typeText: input.typeText ?? null,
    documentation: documentationOf(input.node),
  };
}

/** Class members default to `public`. */
function visibilityForMember(modifiers: readonly string[]): Visibility {
  if (modifiers.includes("private")) {
    return "private";
  }
  if (modifiers.includes("protected")) {
    return "protected";
  }
  return "public";
}

/** Module-level symbols are `exported` when marked with `export`. */
function visibilityForModule(modifiers: readonly string[]): Visibility {
  return modifiers.includes("export") ? "exported" : "local";
}

/**
 * The literal type annotation of a node, falling back to its best-effort
 * resolved type. Returns `null` when neither is available.
 */
function typeTextOf(node: {
  getTypeNode(): { getText(): string } | undefined;
  getType(): { getText(): string };
}): string | null {
  const explicit = node.getTypeNode()?.getText();
  if (explicit !== undefined) {
    return explicit;
  }
  try {
    return node.getType().getText();
  } catch {
    return null;
  }
}

/** The computed value of an enum member, as text (best effort). */
function enumMemberValue(member: EnumMember): string | null {
  try {
    return String(member.getValue());
  } catch {
    return null;
  }
}
