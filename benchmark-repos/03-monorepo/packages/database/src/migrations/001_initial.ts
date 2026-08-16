import { Migration } from './index.js';
import { USERS_TABLE, USERS_INDEXES } from '../schema/users.js';
import { PROJECTS_TABLE, PROJECTS_INDEXES } from '../schema/projects.js';
import { TASKS_TABLE, TASKS_INDEXES } from '../schema/tasks.js';
import { SESSIONS_TABLE, SESSIONS_INDEXES } from '../schema/sessions.js';
import { AUDIT_LOGS_TABLE, AUDIT_LOGS_INDEXES } from '../schema/auditLogs.js';
import { SCHEMA_METADATA_TABLE } from '../schema/index.js';

export const migration001: Migration = {
  version: 1,
  name: '001_initial',
  up: `
    ${SCHEMA_METADATA_TABLE}
    ${USERS_TABLE}
    ${PROJECTS_TABLE}
    ${TASKS_TABLE}
    ${SESSIONS_TABLE}
    ${AUDIT_LOGS_TABLE}
    ${USERS_INDEXES.join('; ')}
    ${PROJECTS_INDEXES.join('; ')}
    ${TASKS_INDEXES.join('; ')}
    ${SESSIONS_INDEXES.join('; ')}
    ${AUDIT_LOGS_INDEXES.join('; ')}
  `,
  down: `
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS schema_metadata;
  `,
};
