// Validator 2 - Input validator

export class Validator2 {
  validate(input: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input) {
      errors.push('Input is required');
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  sanitize(input: any): any {
    return input;
  }
}
