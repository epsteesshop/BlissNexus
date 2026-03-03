/**
 * Database persistence patch for BlissNexus
 * Wraps existing server with PostgreSQL persistence
 */

// Add at top of server.js after requires:
let db = null;
const USE_DB = !!process.env.DATABASE_URL;

if (USE_DB) {
  db = require('./src/db');
  console.log('[DB] PostgreSQL persistence enabled');
}

// Wrap registerAgent function to persist:
const originalRegisterAgent = registerAgent;
function registerAgent(agentId, info, ws) {
  const agent = originalRegisterAgent(agentId, info, ws);
  
  // Persist to database
  if (USE_DB && agent) {
    db.upsertAgent({
      agentId: agent.agentId,
      publicKey: agent.publicKey,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities,
      reputation: agent.reputation,
      tasksCompleted: agent.tasksCompleted,
      tasksFailed: agent.tasksFailed,
      averageLatency: agent.averageLatency,
      averageRating: agent.averageRating,
      online: true
    }).catch(err => console.error('[DB] upsertAgent error:', err.message));
  }
  
  return agent;
}

// Wrap deregisterAgent to persist:
const originalDeregisterAgent = deregisterAgent;
function deregisterAgent(agentId) {
  originalDeregisterAgent(agentId);
  
  if (USE_DB) {
    db.setAgentOnline(agentId, false)
      .catch(err => console.error('[DB] setAgentOnline error:', err.message));
  }
}

// On startup, load agents from DB:
async function loadFromDB() {
  if (!USE_DB) return;
  
  try {
    await db.initDB();
    
    // Load all agents (mark as offline initially)
    const dbAgents = await db.getAllAgents();
    for (const a of dbAgents) {
      agents.set(a.agent_id, {
        agentId: a.agent_id,
        publicKey: a.public_key,
        name: a.name,
        description: a.description,
        capabilities: a.capabilities || [],
        reputation: a.reputation,
        tasksCompleted: a.tasks_completed,
        tasksFailed: a.tasks_failed,
        averageLatency: a.average_latency,
        averageRating: a.average_rating,
        online: false, // Will be set true when they reconnect
        lastSeen: new Date(a.last_seen)
      });
      
      // Rebuild capability index
      for (const cap of (a.capabilities || [])) {
        addAgentToCapability(a.agent_id, cap);
      }
    }
    
    console.log(`[DB] Loaded ${dbAgents.length} agents from database`);
  } catch (err) {
    console.error('[DB] Load error:', err.message);
  }
}

// Call loadFromDB() before server starts
