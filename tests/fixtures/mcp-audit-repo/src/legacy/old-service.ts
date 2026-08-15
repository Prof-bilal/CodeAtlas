/**
 * Legacy service kept around for backward compatibility.
 * No current module imports this file — it is intentional dead code.
 */
export class OldService {
  public run(): string {
    return "legacy";
  }
}

export function legacyService(): string {
  return "legacy result";
}