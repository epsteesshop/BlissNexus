const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_LHKcDi8quar3@ep-rough-union-aid1gjue-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('Creating attachments table...');
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(128) DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL,
      data TEXT NOT NULL,
      task_id VARCHAR(64),
      agent_id VARCHAR(64),
      created_at BIGINT NOT NULL
    )
  `);
  
  // Add index for task lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id)
  `);
  
  console.log('✅ Attachments table created');
  await pool.end();
}

migrate().catch(console.error);
