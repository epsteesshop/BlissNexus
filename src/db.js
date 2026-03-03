/**
 * BlissNexus Database Layer
 * PostgreSQL persistence - fails gracefully if unavailable
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;
let dbReady = false;

// Try to create pool (don't crash if it fails)
try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      max: 5
    });
    pool.on('error', (err) => {
      console.error('[DB] Pool error:', err.message);
    });
  }
} catch (err) {
  console.error('[DB] Failed to create pool:', err.message);
}

async function initDB() {
  if (!pool) {
    console.log('[DB] No database configured');
    return false;
  }
  
  try {
    const client = await pool.connect();
    try {
      const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schema);
      }
      dbReady = true;
      console.log('[DB] PostgreSQL connected and schema initialized');
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[DB] Init failed:', err.message);
    console.log('[DB] Running without persistence');
    return false;
  }
}

function isReady() { return dbReady; }

// Safe query wrapper
async function query(sql, params) {
  if (!dbReady || !pool) return null;
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.error('[DB] Query error:', err.message);
    return null;
  }
}

// ============================================================================
// AGENTS
// ============================================================================

async function getAgent(agentId) {
  const result = await query('SELECT * FROM agents WHERE agent_id = $1', [agentId]);
  return result?.rows?.[0] || null;
}

async function upsertAgent(agent) {
  if (!dbReady) return null;
  const result = await query(`
    INSERT INTO agents (agent_id, public_key, name, description, capabilities, reputation, 
                        tasks_completed, tasks_failed, average_latency, average_rating, 
                        total_earnings, endpoint, last_seen, online)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
    ON CONFLICT (agent_id) DO UPDATE SET
      public_key = EXCLUDED.public_key, name = EXCLUDED.name, 
      description = EXCLUDED.description, capabilities = EXCLUDED.capabilities,
      last_seen = NOW(), online = EXCLUDED.online
    RETURNING *
  `, [
    agent.agentId, agent.publicKey, agent.name, agent.description || '',
    agent.capabilities || [], agent.reputation || 0.5, agent.tasksCompleted || 0,
    agent.tasksFailed || 0, agent.averageLatency || 0, agent.averageRating || 0,
    agent.totalEarnings || 0, agent.endpoint || null, agent.online !== false
  ]);
  return result?.rows?.[0] || null;
}

async function setAgentOnline(agentId, online) {
  await query('UPDATE agents SET online = $2, last_seen = NOW() WHERE agent_id = $1', [agentId, online]);
}

async function getAllAgents() {
  const result = await query('SELECT * FROM agents ORDER BY reputation DESC');
  return result?.rows || [];
}

async function getAgentsByCapability(capability, minRep = 0) {
  const result = await query(`
    SELECT * FROM agents WHERE $1 = ANY(capabilities) AND online = TRUE AND reputation >= $2
    ORDER BY reputation DESC
  `, [capability, minRep]);
  return result?.rows || [];
}

async function heartbeatAgent(agentId) {
  await query('UPDATE agents SET last_seen = NOW() WHERE agent_id = $1', [agentId]);
}

// ============================================================================
// STATS
// ============================================================================

async function getNetworkStats() {
  if (!dbReady) return null;
  const agents = await query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE online = TRUE) as online FROM agents`);
  const tasks = await query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'open') as open FROM tasks`);
  if (!agents || !tasks) return null;
  return { agents: agents.rows[0], tasks: tasks.rows[0] };
}

module.exports = {
  initDB, isReady, query,
  getAgent, upsertAgent, setAgentOnline, getAllAgents, getAgentsByCapability, heartbeatAgent,
  getNetworkStats
};
