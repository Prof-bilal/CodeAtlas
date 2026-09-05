import { getPool } from '../config/database.js';
import { schema } from './schema.js';

export async function runMigrations(): Promise<void> {
  const client = await getPool().connect();
  
  try {
    console.log('Running database migrations...');
    
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      await client.query(statement);
    }
    
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}
