import { Migration } from './index.js';
import { NOTIFICATIONS_TABLE, NOTIFICATIONS_INDEXES } from '../schema/notifications.js';
import { PAYMENTS_TABLE, PAYMENTS_INDEXES } from '../schema/payments.js';

export const migration002: Migration = {
  version: 2,
  name: '002_add_notifications_and_payments',
  up: `
    ${NOTIFICATIONS_TABLE}
    ${PAYMENTS_TABLE}
    ${NOTIFICATIONS_INDEXES.join('; ')}
    ${PAYMENTS_INDEXES.join('; ')}
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id TEXT REFERENCES tasks(id);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
  `,
  down: `
    DROP TABLE IF EXISTS payments;
    DROP TABLE IF EXISTS notifications;
    ALTER TABLE tasks DROP COLUMN IF EXISTS parent_task_id;
  `,
};
