/**
 * BlissNexus Database Layer
 * PostgreSQL persistence for agents, tasks, and capabilities
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize schema
async function initDB() {
  const client = await pool.connect();
  try {
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schema);
      console.log('[DB] Schema initialized');
    }
  } catch (err) {
    console.error('[DB] Schema init error:', err.message);
  } finally {
    client.release();
  }
}

// ============================================================================
// AGENTS
// ============================================================================

async function getAgent(agentId) {
  const result = await pool.query('SELECT * FROM agents WHERE agent_id = $1', [agentId]);
  return result.rows[0] || null;
}

async function upsertAgent(agent) {
  const result = await pool.query(\`
    INSERT INTO agents (agent_id, public_key, name, description, capabilities, reputation, 
                        tasks_completed, tasks_failed, average_latency, average_rating, 
                        total_earnings, endpoint, last_seen, online)
    VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, NOW(), \$13)
    ON CONFLICT (agent_id) DO UPDATE SET
      public_key = EXCLUDED.public_key,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      capabilities = EXCLUDED.capabilities,
      last_seen = NOW(),
      online = EXCLUDED.online
    RETURNING *
  \`, [
    agent.agentId, agent.publicKey, agent.name, agent.description || '',
    agent.capabilities || [], agent.reputation || 0.5, agent.tasksCompleted || 0,
    agent.tasksFailed || 0, agent.averageLatency || 0, agent.averageRating || 0,
    agent.totalEarnings || 0, agent.endpoint || null, agent.online !== false
  ]);
  return result.rows[0];
}

async function setAgentOnline(agentId, online) {
  await pool.query('UPDATE agents SET online = \$2, last_seen = NOW() WHERE agent_id = \$1', [agentId, online]);
}

async function updateAgentStats(agentId, stats) {
  await pool.query(\`
    UPDATE agents SET tasks_completed = \$2, tasks_failed = \$3, average_latency = \$4,
      average_rating = \$5, reputation = \$6, total_earnings = total_earnings + \$7
    WHERE agent_id = \$1
  \`, [agentId, stats.tasksCompleted, stats.tasksFailed, stats.averageLatency, 
      stats.averageRating, stats.reputation, stats.earnings || 0]);
}

async function getOnlineAgents() {
  const result = await pool.query('SELECT * FROM agents WHERE online = TRUE ORDER BY reputation DESC');
  return result.rows;
}

async function getAllAgents() {
  const result = await pool.query('SELECT * FROM agents ORDER BY reputation DESC');
  return result.rows;
}

async function getAgentsByCapability(capability, minReputation = 0) {
  const result = await pool.query(\`
    SELECT * FROM agents WHERE \$1 = ANY(capabilities) AND online = TRUE AND reputation >= \$2
    ORDER BY reputation DESC
  \`, [capability, minReputation]);
  return result.rows;
}

async function heartbeatAgent(agentId) {
  await pool.query('UPDATE agents SET last_seen = NOW() WHERE agent_id = \$1', [agentId]);
}

// ============================================================================
// TASKS
// ============================================================================

async function createTask(task) {
  const result = await pool.query(\`
    INSERT INTO tasks (creator_id, capability, payload, status, reward, deadline_seconds)
    VALUES (\$1, \$2, \$3, \$4, \$5, \$6) RETURNING *
  \`, [task.creatorId, task.capability, JSON.stringify(task.payload), 
      task.status || 'open', task.reward || 0, task.deadlineSeconds || 300]);
  return result.rows[0];
}

async function getTask(taskId) {
  const result = await pool.query('SELECT * FROM tasks WHERE task_id = \$1', [taskId]);
  return result.rows[0] || null;
}

async function getOpenTasks() {
  const result = await pool.query("SELECT * FROM tasks WHERE status = 'open' ORDER BY created_at DESC");
  return result.rows;
}

async function updateTaskStatus(taskId, status, extras = {}) {
  const sets = ['status = \$2'];
  const vals = [taskId, status];
  let i = 3;
  if (extras.assignedAgent) { sets.push(\`assigned_agent = \$\${i}\`); vals.push(extras.assignedAgent); i++; sets.push('assigned_at = NOW()'); }
  if (extras.result) { sets.push(\`result = \$\${i}\`); vals.push(JSON.stringify(extras.result)); i++; sets.push('completed_at = NOW()'); }
  if (extras.error) { sets.push(\`error = \$\${i}\`); vals.push(extras.error); i++; }
  await pool.query(\`UPDATE tasks SET \${sets.join(', ')} WHERE task_id = \$1\`, vals);
}

// ============================================================================
// BIDS
// ============================================================================

async function createBid(bid) {
  const result = await pool.query(\`
    INSERT INTO task_bids (task_id, agent_id, price, eta_seconds) VALUES (\$1, \$2, \$3, \$4) RETURNING *
  \`, [bid.taskId, bid.agentId, bid.price, bid.etaSeconds]);
  return result.rows[0];
}

async function getBidsForTask(taskId) {
  const result = await pool.query(\`
    SELECT tb.*, a.reputation, a.name as agent_name FROM task_bids tb
    JOIN agents a ON tb.agent_id = a.agent_id WHERE tb.task_id = \$1
    ORDER BY tb.price ASC, a.reputation DESC
  \`, [taskId]);
  return result.rows;
}

// ============================================================================
// STATS
// ============================================================================

async function getNetworkStats() {
  const agents = await pool.query(\`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE online = TRUE) as online FROM agents\`);
  const tasks = await pool.query(\`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'open') as open FROM tasks\`);
  const caps = await pool.query('SELECT COUNT(*) as count FROM capabilities');
  return { agents: agents.rows[0], tasks: tasks.rows[0], capabilities: parseInt(caps.rows[0].count) };
}

module.exports = {
  pool, initDB, getAgent, upsertAgent, setAgentOnline, updateAgentStats,
  getOnlineAgents, getAllAgents, getAgentsByCapability, heartbeatAgent,
  createTask, getTask, getOpenTasks, updateTaskStatus, createBid, getBidsForTask, getNetworkStats
};
