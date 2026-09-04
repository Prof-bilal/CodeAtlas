// Database connection - OLD
// DEPRECATED - use the one in src/database/connection.ts

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'myapp_old',
  user: 'postgres',
  password: 'password',
  max: 20,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
