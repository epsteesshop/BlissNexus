const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_LHKcDi8quar3@ep-rough-union-aid1gjue-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function verify() {
  const tables = ['agents', 'marketplace_tasks', 'marketplace_bids', 'chat_messages', 'ratings', 'agent_stats'];
  
  for (const table of tables) {
    const res = await pool.query(`SELECT COUNT(*) FROM ${table}`);
    console.log(`${table}: ${res.rows[0].count} rows`);
  }
  
  await pool.end();
}

verify().catch(console.error);
