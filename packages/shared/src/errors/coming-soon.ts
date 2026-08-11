/**
 * Thrown by stub implementations until their feature is built. Signals an
 * explicitly unfinished part of the system rather than unexpected failure.
 */
export class ComingSoonError extends Error {
  public constructor(feature: string) {
    super(`${feature} is not implemented yet (Coming Soon).`);
    this.name = "ComingSoonError";
  }
}
