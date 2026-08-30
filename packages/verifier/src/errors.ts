export class VerifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifierError";
  }
}

export class ClaimCheckError extends VerifierError {
  constructor(message: string) {
    super(message);
    this.name = "ClaimCheckError";
  }
}

export class CommandRunError extends VerifierError {
  constructor(message: string) {
    super(message);
    this.name = "CommandRunError";
  }
}
