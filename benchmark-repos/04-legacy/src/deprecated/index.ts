// Deprecated module - DO NOT USE
// All exports are stubs

export const deprecated = true;

export function deprecatedFunction() {
  console.warn('This function is deprecated');
  return null;
}

// TODO: remove when all callers are migrated
export function legacyHelper() {
  return {};
}
