// Migration script - OLD
// DEPRECATED

const { runMigrations } = require('../src/database/migrations');

async function migrate() {
  console.log('Running migrations...');
  // ... migration implementation
  console.log('Done');
}

migrate().catch(console.error);
