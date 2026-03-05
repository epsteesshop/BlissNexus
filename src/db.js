/**
 * BlissNexus Database Layer - PostgreSQL (Neon)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;
let dbReady = false;
let lastError = null;

const DB_URL = process.env.NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_LHKcDi8quar3@ep-rough-union-aid1gjue-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';
console.log('[DB] Connecting to Neon...');

try {
  pool = new Pool({
    connectionString: DB_URL,
    ssl: true,
    connectionTimeoutMillis: 10000,
    max: 10
  });
  pool.on('error', (err) => {
    console.error('[DB] Pool error:', err.message);
    lastError = err.message;
  });
} catch (err) {
  console.error('[DB] Failed to create pool:', err.message);
  lastError = err.message;
}

async function initDB() {
  if (!pool) {
    lastError = 'No pool';
    return { success: false, error: lastError };
  }
  
  try {
    const client = await pool.connect();
    console.log('[DB] Connected to Neon!');
    try {
      const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schema);
        console.log('[DB] Schema applied');
      }
      dbReady = true;
      lastError = null;
      console.log('[DB] Ready!');
      return { success: true };
    } finally {
      client.release();
    }
  } catch (err) {
    lastError = err.message;
    console.error('[DB] Init failed:', err.message);
    return { success: false, error: err.message };
  }
}

function isReady() { return dbReady; }
function getLastError() { return lastError; }
function getConnectionUrl() { return 'neon (masked)'; }

async function query(sql, params) {
  if (!dbReady || !pool) return null;
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.error('[DB] Query error:', err.message);
    return null;
  }
}

// AGENTS
async function upsertAgent(agent) {
  if (!dbReady) return null;
  const result = await query(`
    INSERT INTO agents (agent_id, public_key, name, description, capabilities, reputation, 
                        tasks_completed, tasks_failed, average_latency, average_rating, 
                        total_earnings, endpoint, last_seen, online)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
    ON CONFLICT (agent_id) DO UPDATE SET
      public_key = EXCLUDED.public_key, name = EXCLUDED.name, 
      last_seen = NOW(), online = EXCLUDED.online
    RETURNING *
  `, [agent.agentId, agent.publicKey, agent.name, agent.description || '',
      agent.capabilities || [], agent.reputation || 0.5, agent.tasksCompleted || 0,
      agent.tasksFailed || 0, agent.averageLatency || 0, agent.averageRating || 0,
      agent.totalEarnings || 0, agent.endpoint || null, agent.online !== false]);
  return result?.rows?.[0] || null;
}

async function setAgentOnline(agentId, online) {
  await query('UPDATE agents SET online = $2, last_seen = NOW() WHERE agent_id = $1', [agentId, online]);
}

async function getAllAgents() {
  const result = await query('SELECT * FROM agents ORDER BY reputation DESC');
  return result?.rows || [];
}

// MARKETPLACE TASKS
async function saveTask(task) {
  if (!dbReady) return null;
  const result = await query(`
    INSERT INTO marketplace_tasks (id, title, description, max_budget, deadline, capabilities, 
                                   requester, state, assigned_agent, assigned_bid, result, 
                                   escrow_tx, escrow_pda, escrow_signature, attachments, result_attachments, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT (id) DO UPDATE SET
      state = EXCLUDED.state, assigned_agent = EXCLUDED.assigned_agent,
      assigned_bid = EXCLUDED.assigned_bid, result = EXCLUDED.result,
      escrow_pda = EXCLUDED.escrow_pda, updated_at = EXCLUDED.updated_at
    RETURNING *
  `, [task.id, task.title, task.description, task.maxBudget, task.deadline,
      task.capabilities || [], task.requester, task.state, task.assignedAgent,
      task.assignedBid ? JSON.stringify(task.assignedBid) : null, task.result,
      task.escrowTx, task.escrowPDA, task.escrowSignature, JSON.stringify(task.attachments || []), JSON.stringify(task.resultAttachments || []), task.createdAt, task.updatedAt]);
  return result?.rows?.[0] || null;
}

async function getAllTasks() {
  const result = await query('SELECT * FROM marketplace_tasks ORDER BY created_at DESC');
  return result?.rows?.map(dbRowToTask) || [];
}

async function getOpenTasks() {
  const result = await query("SELECT * FROM marketplace_tasks WHERE state = 'open' ORDER BY created_at DESC");
  return result?.rows?.map(dbRowToTask) || [];
}

async function getTaskById(taskId) {
  const result = await query("SELECT * FROM marketplace_tasks WHERE id = $1", [taskId]);
  return result?.rows?.[0] ? dbRowToTask(result.rows[0]) : null;
}

function dbRowToTask(row) {
  return {
    id: row.id, title: row.title, description: row.description,
    maxBudget: parseFloat(row.max_budget), deadline: row.deadline,
    capabilities: row.capabilities || [], requester: row.requester,
    state: row.state, assignedAgent: row.assigned_agent,
    assignedBid: row.assigned_bid ? (typeof row.assigned_bid === 'string' ? JSON.parse(row.assigned_bid) : row.assigned_bid) : null,
    result: row.result, escrowPDA: row.escrow_pda,
    createdAt: parseInt(row.created_at), updatedAt: parseInt(row.updated_at),
    attachments: row.attachments || [],
    resultAttachments: row.result_attachments || [],
  };
}

// BIDS
async function saveBid(bid) {
  if (!dbReady) return null;
  const result = await query(`
    INSERT INTO marketplace_bids (id, task_id, agent_id, agent_name, price, time_estimate, message, wallet, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
    RETURNING *
  `, [bid.id, bid.taskId, bid.agentId, bid.agentName, bid.price, bid.timeEstimate, bid.message, bid.wallet, bid.status, bid.createdAt]);
  return result?.rows?.[0] || null;
}

async function getBidsForTask(taskId) {
  const result = await query('SELECT * FROM marketplace_bids WHERE task_id = $1 ORDER BY price ASC', [taskId]);
  return result?.rows?.map(row => ({
    id: row.id, taskId: row.task_id, agentId: row.agent_id, agentName: row.agent_name,
    price: parseFloat(row.price), timeEstimate: row.time_estimate, message: row.message,
    wallet: row.wallet, status: row.status, createdAt: parseInt(row.created_at),
  })) || [];
}

// AGENT STATS
async function getAgentStats(agentId) {
  const result = await query('SELECT * FROM agent_stats WHERE agent_id = $1', [agentId]);
  if (result?.rows?.[0]) {
    return { completed: result.rows[0].completed, rating: parseFloat(result.rows[0].rating), totalEarned: parseFloat(result.rows[0].total_earned) };
  }
  return { completed: 0, rating: 0, totalEarned: 0 };
}

async function updateAgentStats(agentId, stats) {
  if (!dbReady) return;
  await query(`
    INSERT INTO agent_stats (agent_id, completed, rating, total_earned)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (agent_id) DO UPDATE SET completed = EXCLUDED.completed, rating = EXCLUDED.rating, total_earned = EXCLUDED.total_earned
  `, [agentId, stats.completed, stats.rating, stats.totalEarned]);
}

module.exports = {
  saveAttachment, getAttachment, getTaskAttachments,
  initDB, isReady, getLastError, getConnectionUrl, query,
  upsertAgent, setAgentOnline, getAllAgents,
  saveTask, getAllTasks, getOpenTasks,
  saveBid, getBidsForTask,
  getAgentStats, updateAgentStats
};

// ==================== CHAT ====================

async function saveMessage(taskId, senderId, senderName, message) {
  const result = await query(
    `INSERT INTO chat_messages (task_id, sender_id, sender_name, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [taskId, senderId, senderName, message]
  );
  return result.rows[0];
}

async function getMessages(taskId, limit = 100) {
  const result = await query(
    `SELECT * FROM chat_messages 
     WHERE task_id = $1 
     ORDER BY created_at ASC 
     LIMIT $2`,
    [taskId, limit]
  );
  return result.rows;
}

module.exports.saveMessage = saveMessage;
module.exports.getMessages = getMessages;
module.exports.getTaskById = getTaskById;

// ==================== RATINGS ====================

async function saveRating(taskId, raterId, rateeId, rating, review, raterRole) {
  const result = await query(
    `INSERT INTO ratings (task_id, rater_id, ratee_id, rating, review, rater_role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (task_id, rater_id) DO UPDATE SET
       rating = $4, review = $5, created_at = NOW()
     RETURNING *`,
    [taskId, raterId, rateeId, rating, review, raterRole]
  );
  return result.rows[0];
}

async function getRatingsForUser(userId) {
  const result = await query(
    `SELECT * FROM ratings WHERE ratee_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function getAverageRating(userId) {
  const result = await query(
    `SELECT 
       COUNT(*) as total_ratings,
       ROUND(AVG(rating)::numeric, 1) as average_rating
     FROM ratings WHERE ratee_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  return {
    totalRatings: parseInt(row.total_ratings) || 0,
    averageRating: parseFloat(row.average_rating) || 0
  };
}

async function getRatingsForTask(taskId) {
  const result = await query(
    `SELECT * FROM ratings WHERE task_id = $1`,
    [taskId]
  );
  return result.rows;
}

async function hasUserRatedTask(taskId, raterId) {
  const result = await query(
    `SELECT 1 FROM ratings WHERE task_id = $1 AND rater_id = $2`,
    [taskId, raterId]
  );
  return result.rows.length > 0;
}

module.exports.saveRating = saveRating;
module.exports.getRatingsForUser = getRatingsForUser;
module.exports.getAverageRating = getAverageRating;
module.exports.getRatingsForTask = getRatingsForTask;
module.exports.hasUserRatedTask = hasUserRatedTask;

// ATTACHMENTS
async function saveAttachment(attachment) {
  const result = await query(`
    INSERT INTO attachments (id, name, type, size, data, task_id, agent_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      data = EXCLUDED.data
    RETURNING *
  `, [attachment.id, attachment.name, attachment.type, attachment.size, 
      attachment.data, attachment.taskId, attachment.agentId, attachment.createdAt]);
  return result?.rows?.[0] || null;
}

async function getAttachment(id) {
  const result = await query('SELECT * FROM attachments WHERE id = $1', [id]);
  return result?.rows?.[0] || null;
}

async function getTaskAttachments(taskId) {
  const result = await query('SELECT id, name, type, size, created_at FROM attachments WHERE task_id = $1', [taskId]);
  return result?.rows || [];
}
