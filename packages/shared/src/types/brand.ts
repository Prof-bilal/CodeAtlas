/**
 * A branded primitive type. Brands let the type system distinguish otherwise
 * identical primitives (e.g. a file path vs. a project id) at zero runtime
 * cost, making cross-package boundaries harder to misuse.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ProjectId = Brand<string, "ProjectId">;
export type FilePath = Brand<string, "FilePath">;
export type SymbolId = Brand<string, "SymbolId">;
export type NodeId = Brand<string, "NodeId">;
export type EdgeId = Brand<string, "EdgeId">;
export type CacheKey = Brand<string, "CacheKey">;
