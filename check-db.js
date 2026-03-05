const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_LHKcDi8quar3@ep-rough-union-aid1gjue-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const res = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  console.log('Tables:', res.rows.map(r => r.table_name));
  await pool.end();
}

check().catch(console.error);
