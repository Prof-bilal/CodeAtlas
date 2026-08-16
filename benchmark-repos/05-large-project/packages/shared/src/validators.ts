export interface ValidationRule<T> { validate(value: T): ValidationResult; message: string; }
export interface ValidationResult { valid: boolean; errors: ValidationError[]; }
export interface ValidationError { field: string; rule: string; message: string; value?: unknown; }
export class Validator<T extends Record<string, unknown>> {
  private rules = new Map<string, ValidationRule<unknown>[]>();
  field<K extends keyof T & string>(name: K): FieldBuilder<T[K]> { return new FieldBuilder<T[K]>(this, name); }
  addRule(field: string, rule: ValidationRule<unknown>): void { if (!this.rules.has(field)) this.rules.set(field, []); this.rules.get(field)!.push(rule); }
  validate(data: T): ValidationResult {
    const errors: ValidationError[] = [];
    for (const [field, rules] of this.rules) { for (const rule of rules) { const r = rule.validate(data[field]); if (!r.valid) errors.push(...r.errors); } }
    return { valid: errors.length === 0, errors };
  }
}
class FieldBuilder<T> {
  constructor(private v: Validator<any>, private f: string) {}
  required(): this { this.v.addRule(this.f, { validate: v => v != null && v !== '' ? { valid: true, errors: [] } : { valid: false, errors: [{ field: this.f, rule: 'required', message: 'Required' }] }, message: 'Required' }); return this; }
  minLength(n: number): this { this.v.addRule(this.f, { validate: v => typeof v === 'string' && v.length >= n ? { valid: true, errors: [] } : { valid: false, errors: [{ field: this.f, rule: 'minLength', message: 'Too short' }] }, message: 'Too short' }); return this; }
  maxLength(n: number): this { this.v.addRule(this.f, { validate: v => typeof v === 'string' && v.length <= n ? { valid: true, errors: [] } : { valid: false, errors: [{ field: this.f, rule: 'maxLength', message: 'Too long' }] }, message: 'Too long' }); return this; }
  email(): this { this.v.addRule(this.f, { validate: v => typeof v === 'string' && /^[^@]+@[^@]+$/.test(v) ? { valid: true, errors: [] } : { valid: false, errors: [{ field: this.f, rule: 'email', message: 'Invalid email' }] }, message: 'Invalid email' }); return this; }
}