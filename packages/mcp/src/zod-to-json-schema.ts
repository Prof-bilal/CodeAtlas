/**
 * Minimal zod-to-JSON-schema converter for the subset of zod types used in
 * `tools.ts`. Handles: string, number (with int/min/max), boolean, enum,
 * array, object, record, optional, nullable, describe, and any.
 *
 * This avoids adding `zod-to-json-schema` as a direct dependency while
 * keeping the dependency graph clean. The converter is self-contained and
 * tested against the exact schemas `tools.ts` produces.
 */

import { z } from "zod";

/** Recursively convert a zod type to a JSON Schema object. */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return convert(schema) as Record<string, unknown>;
}

function convert(schema: z.ZodType): Record<string, unknown> {
  // z.ZodOptional wraps an inner type
  if (schema instanceof z.ZodOptional) {
    return convert(schema._def.innerType);
  }

  // z.ZodNullable wraps an inner type and adds null
  if (schema instanceof z.ZodNullable) {
    const inner = convert(schema._def.innerType);
    return { ...inner, nullable: true };
  }

  // z.ZodEffects (describe, transforms) — unwrap
  if (schema instanceof z.ZodEffects) {
    return convert(schema._def.schema);
  }

  // z.ZodString
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: "string" };
    const checks = schema._def.checks ?? [];
    for (const check of checks) {
      if (check.kind === "max" && typeof check.value === "number") {
        result["maxLength"] = check.value;
      }
    }
    return result;
  }

  // z.ZodNumber (with optional int/min/max)
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: "number" };
    const checks = schema._def.checks ?? [];
    for (const check of checks) {
      if (check.kind === "int") {
        result["type"] = "integer";
      } else if (check.kind === "min" && typeof check.value === "number") {
        result["minimum"] = check.value;
      } else if (check.kind === "max" && typeof check.value === "number") {
        result["maximum"] = check.value;
      }
    }
    return result;
  }

  // z.ZodBoolean
  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  // z.ZodAny
  if (schema instanceof z.ZodAny) {
    return {};
  }

  // z.ZodEnum
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: [...schema.options] };
  }

  // z.ZodArray
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: convert(schema._def.type) };
  }

  // z.ZodObject — iterate shape
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convert(value as z.ZodType);
      // A field is required unless it's optional or nullable (nullable fields
      // may still be present, so they are NOT required)
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodNullable)) {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  // z.ZodRecord
  if (schema instanceof z.ZodRecord) {
    return {
      type: "object",
      additionalProperties: convert(schema._def.valueType),
    };
  }

  // z.ZodLazy (recursive types — unlikely here but safe fallback)
  if (schema instanceof z.ZodLazy) {
    return convert(schema._def.getter());
  }

  // Fallback: empty schema
  return {};
}
