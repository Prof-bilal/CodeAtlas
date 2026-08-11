import type { SQLOutputValue } from "node:sqlite";

/** A raw row returned by `node:sqlite` (SQL values only). */
export type Row = Record<string, SQLOutputValue>;

/** Coerce a statement's `changes` count (reported as `number | bigint`) to a
 * number. */
export function count(value: number | bigint): number {
  return Number(value);
}

/** Read a nullable TEXT column as `string | null`. */
export function colString(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

/** Read an INTEGER/REAL column as a number (bigint coerced). */
export function colNumber(row: Row, key: string): number {
  const value = row[key];
  if (typeof value === "number") {
    return value;
  }
  return typeof value === "bigint" ? Number(value) : 0;
}

/** Read a 0/1 INTEGER column as a boolean. */
export function colBoolean(row: Row, key: string): boolean {
  return colNumber(row, key) === 1;
}
