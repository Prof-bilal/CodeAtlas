export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

export { migration001 } from './001_initial.js';
export { migration002 } from './002_add_tasks.js';
export { migration003 } from './003_add_payments.js';

import { migration001 } from './001_initial.js';
import { migration002 } from './002_add_tasks.js';
import { migration003 } from './003_add_payments.js';

export const migrations: Migration[] = [migration001, migration002, migration003];

export function getMigrationByVersion(version: number): Migration | undefined {
  return migrations.find(m => m.version === version);
}

export function getLatestMigration(): Migration {
  return migrations[migrations.length - 1];
}

export function getMigrationsAfterVersion(version: number): Migration[] {
  return migrations.filter(m => m.version > version);
}

export function validateMigrations(): boolean {
  for (let i = 0; i < migrations.length; i++) {
    if (migrations[i].version !== i + 1) {
      return false;
    }
  }
  return true;
}
