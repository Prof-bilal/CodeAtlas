export interface PasswordPolicyConfig { minLength: number; maxLength: number; requireUppercase: boolean; requireLowercase: boolean; requireNumbers: boolean; requireSpecial: boolean; preventReuse: number; lockoutAttempts: number; }
export class PasswordPolicy {
  private config: PasswordPolicyConfig;
  private history = new Map<string, string[]>();
  constructor(config?: Partial<PasswordPolicyConfig>) { this.config = { minLength: 8, maxLength: 128, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecial: true, preventReuse: 5, lockoutAttempts: 5, ...config }; }
  validate(password: string): { valid: boolean; errors: string[]; score: number } {
    const errors: string[] = [];
    if (password.length < this.config.minLength) errors.push('Too short');
    if (password.length > this.config.maxLength) errors.push('Too long');
    if (this.config.requireUppercase && !/[A-Z]/.test(password)) errors.push('Needs uppercase');
    if (this.config.requireLowercase && !/[a-z]/.test(password)) errors.push('Needs lowercase');
    if (this.config.requireNumbers && !/[0-9]/.test(password)) errors.push('Needs number');
    if (this.config.requireSpecial && !/[!@#$%^&*]/.test(password)) errors.push('Needs special');
    let score = 0;
    if (password.length >= 8) score++; if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++; if (/[^a-zA-Z0-9]/.test(password)) score++;
    return { valid: errors.length === 0, errors, score };
  }
  isLockedOut(userId: string, attempts: number): boolean { return attempts >= this.config.lockoutAttempts; }
}