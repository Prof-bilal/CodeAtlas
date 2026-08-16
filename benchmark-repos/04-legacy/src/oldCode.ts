// Old code file - everything is commented out
// DO NOT REMOVE - some functions may still be referenced
// Last touched: 2023-08-15

// PLACEHOLDER - All code has been migrated or removed

/*
// Old database migration functions
export async function migrateV1ToV2(db: Database) {
  console.log('Migrating from v1 to v2...');
  // ... migration code removed
}

export async function migrateV2ToV3(db: Database) {
  console.log('Migrating from v2 to v3...');
  // ... migration code removed
}

// Old cache functions
export class OldCache {
  private store: Map<string, any> = new Map();

  get(key: string) {
    return this.store.get(key);
  }

  set(key: string, value: any, ttl?: number) {
    this.store.set(key, value);
    if (ttl) {
      setTimeout(() => this.store.delete(key), ttl);
    }
  }

  delete(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

// Old validation functions
export function validateUser(user: any): string[] {
  const errors: string[] = [];
  if (!user.username) errors.push('Username is required');
  if (!user.email) errors.push('Email is required');
  if (user.password && user.password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }
  return errors;
}

export function validatePayment(payment: any): string[] {
  const errors: string[] = [];
  if (!payment.userId) errors.push('User ID is required');
  if (!payment.amount || payment.amount <= 0) {
    errors.push('Amount must be positive');
  }
  return errors;
}

// Old email sending function
export async function sendEmail(to: string, subject: string, body: string) {
  console.log(`Sending email to ${to}: ${subject}`);
  // ... email code removed
}
*/

export const OLD_CODE_PLACEHOLDER = true;
