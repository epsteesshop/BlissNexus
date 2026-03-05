const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_LHKcDi8quar3@ep-rough-union-aid1gjue-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function reset() {
  console.log('🗑️  Wiping agents...\n');
  
  const agents = await pool.query('DELETE FROM agents RETURNING agent_id');
  console.log(`Deleted ${agents.rowCount} agents`);
  
  console.log('\n✅ All data wiped!');
  
  await pool.end();
}

reset().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
