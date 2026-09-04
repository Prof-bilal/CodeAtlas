// Validator 8 - DEPRECATED

export class Validator8 {
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
