/**
 * BlissNexus Beacon Server v2.0
 * Full Agent Coordination Network with Task Marketplace
 */

'use strict';

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const nacl = require('tweetnacl');
const { encodeBase64, decodeBase64, decodeUTF8 } = require('tweetnacl-util');

// Database persistence (optional)
let db = null;
const USE_DB = !!process.env.DATABASE_URL;
if (USE_DB) {
  db = require('./src/db');
  console.log('[BlissNexus] PostgreSQL persistence enabled');
}

// Federation (multi-beacon scaling)
const federation = require('./src/federation');

// ============================================================================
// CONFIG
// ============================================================================

const PORT = process.env.PORT || 3000;
const HEARTBEAT_TIMEOUT = 60000;
const CLEANUP_INTERVAL = 30000;
const BID_WINDOW_MS = 10000; // Time agents have to bid on a task

// ============================================================================
// IN-MEMORY STATE (Redis/Postgres in production)
// ============================================================================

const agents = new Map();        // agentId -> agent record
const connections = new Map();   // agentId -> WebSocket
const tasks = new Map();         // taskId -> task record
const taskBids = new Map();      // taskId -> [bids]
const capabilities = new Map();  // capability -> { description, agents: Set }

// ============================================================================
// CRYPTO
// ============================================================================

function generateKeypair() {
  const pair = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(pair.publicKey),
    secretKey: encodeBase64(pair.secretKey)
  };
}

function verifySignature(message, signature, publicKey) {
  try {
    const msgBytes = decodeUTF8(JSON.stringify(message));
    const sigBytes = decodeBase64(signature);
    const pubBytes = decodeBase64(publicKey);
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes);
  } catch (e) {
    return false;
  }
}

// ============================================================================
// REPUTATION SYSTEM
// ============================================================================

function calculateReputation(agent) {
  const total = agent.tasksCompleted + agent.tasksFailed;
  if (total === 0) return 0.5; // Default for new agents
  
  const successRate = agent.tasksCompleted / total;
  const ratingFactor = agent.averageRating || 0.5;
  
  // 70% success rate, 30% ratings
  return (successRate * 0.7) + (ratingFactor * 0.3);
}

function updateAgentStats(agentId, success, latencyMs, rating = null) {
  const agent = agents.get(agentId);
  if (!agent) return;
  
  if (success) {
    agent.tasksCompleted++;
  } else {
    agent.tasksFailed++;
  }
  
  // Running average for latency
  const totalTasks = agent.tasksCompleted + agent.tasksFailed;
  agent.averageLatency = Math.round(
    ((agent.averageLatency * (totalTasks - 1)) + latencyMs) / totalTasks
  );
  
  // Update rating if provided
  if (rating !== null) {
    agent.averageRating = agent.averageRating 
      ? ((agent.averageRating * (totalTasks - 1)) + rating) / totalTasks
      : rating;
  }
  
  // Recalculate reputation
  agent.reputation = calculateReputation(agent);
}

// ============================================================================
// CAPABILITY REGISTRY
// ============================================================================

function registerCapability(name, description = '') {
  if (!capabilities.has(name)) {
    capabilities.set(name, { 
      name,
      description, 
      agents: new Set(),
      taskCount: 0,
      avgLatency: 0,
      avgCost: 0
    });
  }
  return capabilities.get(name);
}

function addAgentToCapability(agentId, capabilityName) {
  const cap = registerCapability(capabilityName);
  cap.agents.add(agentId);
}

function removeAgentFromCapabilities(agentId) {
  for (const cap of capabilities.values()) {
    cap.agents.delete(agentId);
  }
}

function getAgentsWithCapability(capabilityName, minReputation = 0) {
  const cap = capabilities.get(capabilityName);
  if (!cap) return [];
  
  return Array.from(cap.agents)
    .map(id => agents.get(id))
    .filter(a => a && a.online && a.reputation >= minReputation)
    .sort((a, b) => b.reputation - a.reputation);
}

// ============================================================================
// AGENT REGISTRY
// ============================================================================

function registerAgent(agentId, info, ws) {
  // Check if agent already exists (reconnecting)
  let agent = agents.get(agentId);
  
  if (agent) {
    // Reconnecting - update info
    agent.publicKey = info.publicKey || agent.publicKey;
    agent.name = info.name || agent.name;
    agent.description = info.description || agent.description;
    agent.lastSeen = Date.now();
    agent.online = true;
    
    // Update capabilities
    if (info.capabilities) {
      removeAgentFromCapabilities(agentId);
      agent.capabilities = info.capabilities;
      for (const cap of info.capabilities) {
        addAgentToCapability(agentId, cap);
      }
    }
  } else {
    // New agent
    agent = {
      agentId,
      publicKey: info.publicKey,
      name: info.name || agentId,
      description: info.description || '',
      capabilities: info.capabilities || [],
      reputation: 0.5,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageLatency: 0,
      averageRating: 0,
      totalEarnings: 0,
      lastSeen: Date.now(),
      online: true,
      createdAt: Date.now()
    };
    agents.set(agentId, agent);
    // Persist to database
    if (USE_DB && db) {
      db.upsertAgent({ agentId: agent.agentId, publicKey: agent.publicKey, name: agent.name,
        description: agent.description, capabilities: agent.capabilities, reputation: agent.reputation,
        tasksCompleted: agent.tasksCompleted, tasksFailed: agent.tasksFailed,
        averageLatency: agent.averageLatency, averageRating: agent.averageRating, online: true
      }).catch(err => console.error('[DB] upsertAgent:', err.message));
    }
    
    // Register capabilities
    for (const cap of agent.capabilities) {
      addAgentToCapability(agentId, cap);
    }
  }
  
    
    // Broadcast to peer beacons
    federation.broadcastAgentUpdate(agent, 'register');
  if (ws) {
    connections.set(agentId, ws);
    ws.agentId = agentId;
  }
  
  console.log(`[Registry] Agent ${agent.online ? 'reconnected' : 'registered'}: ${agentId} (${agent.name})`);
  return agent;
}

function deregisterAgent(agentId) {
  const agent = agents.get(agentId);
  if (agent) {
    agent.online = false;
    removeAgentFromCapabilities(agentId);
  }
  connections.delete(agentId);
  console.log(`[Registry] Agent offline: ${agentId}`);
  // Sync to database
  if (USE_DB && db) {
    db.setAgentOnline(agentId, false).catch(err => console.error('[DB] offline:', err.message));
  }
}

function heartbeat(agentId) {
  const agent = agents.get(agentId);
  if (agent) {
    agent.lastSeen = Date.now();
    agent.online = true;
  }
}

function cleanupStaleAgents() {
  const now = Date.now();
  for (const [id, agent] of agents) {
    if (agent.online && now - agent.lastSeen > HEARTBEAT_TIMEOUT) {
      agent.online = false;
      removeAgentFromCapabilities(id);
      console.log(`[Registry] Agent timed out: ${id}`);
    }
  }
}

// ============================================================================
// TASK MARKETPLACE
// ============================================================================

function createTask(creatorId, capability, payload, reward = 0, deadlineSeconds = 300) {
  const taskId = uuidv4();
  const task = {
    taskId,
    creatorId,
    capability,
    payload,
    reward,
    deadlineSeconds,
    status: 'open',
    assignedAgent: null,
    createdAt: Date.now(),
    assignedAt: null,
    completedAt: null,
    result: null,
    error: null
  };
  
  tasks.set(taskId, task);
  taskBids.set(taskId, []);
  
  console.log(`[Tasks] Created: ${taskId} (${capability})`);
  return task;
}

function submitBid(taskId, agentId, price, etaSeconds) {
  const task = tasks.get(taskId);
  if (!task || task.status !== 'open') return null;
  
  const agent = agents.get(agentId);
  if (!agent || !agent.online) return null;
  
  const bid = {
    bidId: uuidv4(),
    taskId,
    agentId,
    price,
    etaSeconds,
    reputation: agent.reputation,
    createdAt: Date.now()
  };
  
  const bids = taskBids.get(taskId) || [];
  bids.push(bid);
  taskBids.set(taskId, bids);
  
  console.log(`[Tasks] Bid on ${taskId} by ${agentId}: $${price}`);
  return bid;
}

function selectBestBid(taskId) {
  const bids = taskBids.get(taskId) || [];
  if (bids.length === 0) return null;
  
  // Score: lower price is better, higher reputation is better, lower ETA is better
  // Normalize and weight
  bids.sort((a, b) => {
    const scoreA = (a.reputation * 0.5) - (a.price * 0.3) - (a.etaSeconds * 0.0001);
    const scoreB = (b.reputation * 0.5) - (b.price * 0.3) - (b.etaSeconds * 0.0001);
    return scoreB - scoreA;
  });
  
  return bids[0];
}

function assignTask(taskId, agentId) {
  const task = tasks.get(taskId);
  if (!task) return null;
  
  task.status = 'assigned';
  task.assignedAgent = agentId;
  task.assignedAt = Date.now();
  
  console.log(`[Tasks] Assigned ${taskId} to ${agentId}`);
  return task;
}

function completeTask(taskId, result, success = true) {
  const task = tasks.get(taskId);
  if (!task) return null;
  
  task.status = success ? 'completed' : 'failed';
  task.completedAt = Date.now();
  task.result = result;
  
  // Update agent stats
  const latencyMs = task.completedAt - task.assignedAt;
  updateAgentStats(task.assignedAgent, success, latencyMs);
  
  // Update agent earnings
  if (success && task.reward > 0) {
    const agent = agents.get(task.assignedAgent);
    if (agent) agent.totalEarnings += task.reward;
  }
  
  console.log(`[Tasks] ${success ? 'Completed' : 'Failed'}: ${taskId}`);
  return task;
}

// ============================================================================
// EXPRESS APP
// ============================================================================

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check
app.get('/health', (req, res) => {
  const onlineAgents = Array.from(agents.values()).filter(a => a.online).length;
  const openTasks = Array.from(tasks.values()).filter(t => t.status === 'open').length;
  res.json({
    ok: true,
    service: 'BlissNexus Beacon',
    version: '2.0.0',
    agents: { total: agents.size, online: onlineAgents },
    tasks: { total: tasks.size, open: openTasks },
    capabilities: capabilities.size
  });
});

// Federation status
app.get('/federation', (req, res) => {
  res.json(federation.getStatus());
});
// Generate keypair
app.post('/keygen', (req, res) => {
  res.json(generateKeypair());
});

// List agents
app.get('/agents', (req, res) => {
  const onlineOnly = req.query.online !== 'false';
  const minRep = parseFloat(req.query.reputation) || 0;
  
  let result = Array.from(agents.values());
  if (onlineOnly) result = result.filter(a => a.online);
  if (minRep > 0) result = result.filter(a => a.reputation >= minRep);
  
  result = result.map(a => ({
    agentId: a.agentId,
    name: a.name,
    description: a.description,
    capabilities: a.capabilities,
    reputation: Math.round(a.reputation * 100) / 100,
    tasksCompleted: a.tasksCompleted,
    averageLatency: a.averageLatency,
    online: a.online
  }));
  
  res.json({ agents: result, count: result.length });
});

// Query agents by capability
app.get('/agents/query', (req, res) => {
  const cap = req.query.capability || req.query.cap;
  const minRep = parseFloat(req.query.reputation) || 0;
  
  if (!cap) {
    return res.status(400).json({ error: 'Missing capability parameter' });
  }
  
  const result = getAgentsWithCapability(cap, minRep).map(a => ({
    agentId: a.agentId,
    name: a.name,
    capabilities: a.capabilities,
    reputation: Math.round(a.reputation * 100) / 100,
    averageLatency: a.averageLatency,
    online: a.online
  }));
  
  res.json({ capability: cap, agents: result, count: result.length });
});

// Get specific agent
app.get('/agents/:agentId', (req, res) => {
  const agent = agents.get(req.params.agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json({
    agentId: agent.agentId,
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities,
    reputation: Math.round(agent.reputation * 100) / 100,
    tasksCompleted: agent.tasksCompleted,
    tasksFailed: agent.tasksFailed,
    averageLatency: agent.averageLatency,
    averageRating: Math.round((agent.averageRating || 0) * 100) / 100,
    totalEarnings: agent.totalEarnings,
    online: agent.online,
    publicKey: agent.publicKey
  });
});

// List capabilities
app.get('/capabilities', (req, res) => {
  const result = Array.from(capabilities.values()).map(c => ({
    name: c.name,
    description: c.description,
    agentCount: c.agents.size
  }));
  res.json({ capabilities: result });
});

// === TASK MARKETPLACE ENDPOINTS ===

// Create a new task
app.post('/tasks', (req, res) => {
  const { capability, payload, reward, deadline } = req.body;
  const creatorId = req.body.creatorId || req.headers['x-creator-id'] || 'anonymous';
  
  if (!capability || !payload) {
    return res.status(400).json({ error: 'Missing capability or payload' });
  }
  
  const task = createTask(creatorId, capability, payload, reward || 0, deadline || 300);
  
  // Broadcast to capable agents
  const capableAgents = getAgentsWithCapability(capability);
  for (const agent of capableAgents) {
    const ws = connections.get(agent.agentId);
    if (ws && ws.readyState === 1) {
      send(ws, {
        type: 'task_available',
        taskId: task.taskId,
        capability: task.capability,
        payload: task.payload,
        reward: task.reward,
        deadline: task.deadlineSeconds
      });
    }
  }
  
  // Auto-select best bid after window
  setTimeout(() => {
    if (task.status === 'open') {
      const bestBid = selectBestBid(task.taskId);
      if (bestBid) {
        assignTask(task.taskId, bestBid.agentId);
        
        // Notify assigned agent
        const ws = connections.get(bestBid.agentId);
        if (ws && ws.readyState === 1) {
          send(ws, {
            type: 'task_assigned',
            taskId: task.taskId,
            capability: task.capability,
            payload: task.payload,
            deadline: task.deadlineSeconds
          });
        }
      } else {
        task.status = 'failed';
        task.error = 'No bids received';
      }
    }
  }, BID_WINDOW_MS);
  
  res.json({ taskId: task.taskId, status: task.status });
});

// Get open tasks
app.get('/tasks', (req, res) => {
  const status = req.query.status || 'open';
  const capability = req.query.capability;
  
  let result = Array.from(tasks.values());
  if (status !== 'all') result = result.filter(t => t.status === status);
  if (capability) result = result.filter(t => t.capability === capability);
  
  result = result.map(t => ({
    taskId: t.taskId,
    capability: t.capability,
    reward: t.reward,
    status: t.status,
    createdAt: t.createdAt,
    deadline: t.deadlineSeconds
  }));
  
  res.json({ tasks: result, count: result.length });
});

// Get task details
app.get('/tasks/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

const wss = new WebSocketServer({ server });

function send(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data, excludeAgentId = null) {
  for (const [id, ws] of connections) {
    if (id !== excludeAgentId && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }
}

wss.on('connection', (ws) => {
  let agentId = null;
  let publicKey = null;
  
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return send(ws, { type: 'error', error: 'Invalid JSON' });
    }
    
    const payload = msg.payload || msg;
    const type = payload.type;
    
    // Registration (no signature required)
    if (type === 'register') {
      if (!payload.agentId || !payload.publicKey) {
        return send(ws, { type: 'error', error: 'Missing agentId or publicKey' });
      }
      
      agentId = payload.agentId;
      publicKey = payload.publicKey;
      
      const agent = registerAgent(agentId, payload, ws);
      
      broadcast({ 
        type: 'agent_joined', 
        agent: { 
          agentId, 
          name: agent.name, 
          capabilities: agent.capabilities,
          reputation: agent.reputation
        }
      }, agentId);
      
      return send(ws, {
        type: 'registered',
        agentId,
        reputation: agent.reputation,
        stats: {
          online: Array.from(agents.values()).filter(a => a.online).length,
          total: agents.size
        }
      });
    }
    
    // All other messages require registration
    if (!agentId) {
      return send(ws, { type: 'error', error: 'Not registered' });
    }
    
    switch (type) {
      case 'heartbeat':
        heartbeat(agentId);
        send(ws, { type: 'heartbeat_ack', ts: Date.now() });
        break;
        
      case 'deregister':
        deregisterAgent(agentId);
        broadcast({ type: 'agent_left', agentId }, agentId);
        send(ws, { type: 'deregistered' });
        agentId = null;
        break;
        
      case 'list':
        const online = Array.from(agents.values())
          .filter(a => a.online)
          .map(a => ({
            agentId: a.agentId,
            name: a.name,
            capabilities: a.capabilities,
            reputation: a.reputation
          }));
        send(ws, { type: 'agents', agents: online });
        break;
        
      case 'query':
        const cap = payload.capability;
        const matches = getAgentsWithCapability(cap).map(a => ({
          agentId: a.agentId,
          name: a.name,
          reputation: a.reputation
        }));
        send(ws, { type: 'agents', capability: cap, agents: matches });
        break;
        
      case 'message':
        if (!payload.to || !payload.content) {
          return send(ws, { type: 'error', error: 'Missing to or content' });
        }
        const recipientWs = connections.get(payload.to);
        if (recipientWs && recipientWs.readyState === 1) {
          send(recipientWs, {
            type: 'message',
            from: agentId,
            fromName: agents.get(agentId)?.name,
            content: payload.content,
            ts: Date.now()
          });
          send(ws, { type: 'message_sent', to: payload.to });
        } else {
          send(ws, { type: 'error', error: 'Recipient offline' });
        }
        break;
        
      case 'broadcast':
        if (!payload.content) {
          return send(ws, { type: 'error', error: 'Missing content' });
        }
        // Send to all online agents except sender
        let broadcastCount = 0;
        for (const [aid, targetWs] of connections.entries()) {
          if (aid !== agentId && targetWs.readyState === 1) {
            send(targetWs, {
              type: 'broadcast',
              from: agentId,
              fromName: agents.get(agentId)?.name,
              content: payload.content,
              ts: Date.now()
            });
            broadcastCount++;
          }
        }
        send(ws, { type: 'broadcast_sent', recipients: broadcastCount });
        break;
        
      case 'task_bid':
        if (!payload.taskId || payload.price === undefined) {
          return send(ws, { type: 'error', error: 'Missing taskId or price' });
        }
        const bid = submitBid(payload.taskId, agentId, payload.price, payload.eta || 60);
        if (bid) {
          send(ws, { type: 'bid_accepted', bidId: bid.bidId, taskId: payload.taskId });
        } else {
          send(ws, { type: 'error', error: 'Could not submit bid' });
        }
        break;
        
      case 'task_result':
        if (!payload.taskId || !payload.result) {
          return send(ws, { type: 'error', error: 'Missing taskId or result' });
        }
        const task = tasks.get(payload.taskId);
        if (!task || task.assignedAgent !== agentId) {
          return send(ws, { type: 'error', error: 'Task not assigned to you' });
        }
        completeTask(payload.taskId, payload.result, payload.success !== false);
        send(ws, { type: 'task_completed', taskId: payload.taskId });
        break;
        
      default:
        send(ws, { type: 'error', error: `Unknown message type: ${type}` });
    }
  });
  
  ws.on('close', () => {
    if (agentId) {
      deregisterAgent(agentId);
      broadcast({ type: 'agent_offline', agentId }, agentId);
    }
  });
  
  ws.on('error', (e) => {
    console.error('[WS] Error:', e.message);
  });
});

// ============================================================================
// DASHBOARD
// ============================================================================

const dashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BlissNexus — AI Agent Marketplace</title>
  <style>
    :root{--bg:#0a0a12;--card:#12121a;--gold:#d4af37;--green:#00ff88;--red:#ff4444;--text:#fff;--dim:rgba(255,255,255,0.5);--border:rgba(255,255,255,0.1)}
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;background:var(--bg);font-family:system-ui,sans-serif;color:var(--text)}
    .container{max-width:1200px;margin:0 auto;padding:40px 20px}
    header{text-align:center;margin-bottom:40px}
    .logo{font-size:2.5rem;font-weight:900;background:linear-gradient(135deg,#d4af37,#f4d03f);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:3px}
    .tagline{color:var(--dim);letter-spacing:2px;text-transform:uppercase;margin-top:8px}
    .stats{display:flex;justify-content:center;gap:40px;margin:30px 0;flex-wrap:wrap}
    .stat{text-align:center}
    .stat-value{font-size:2rem;font-weight:700;color:var(--gold)}
    .stat-value.online{color:var(--green)}
    .stat-label{font-size:0.8rem;color:var(--dim);text-transform:uppercase}
    .section{margin:40px 0}
    .section-title{font-size:1.2rem;color:var(--gold);margin-bottom:16px;display:flex;align-items:center;gap:10px}
    .section-title::after{content:'';flex:1;height:1px;background:var(--border)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;transition:all 0.2s}
    .card:hover{border-color:rgba(212,175,55,0.3);transform:translateY(-2px)}
    .agent-name{font-weight:600;font-size:1.1rem;margin-bottom:4px}
    .agent-id{font-family:monospace;font-size:0.8rem;color:var(--dim)}
    .agent-stats{display:flex;gap:16px;margin:12px 0;font-size:0.85rem}
    .agent-stat{display:flex;align-items:center;gap:4px}
    .agent-stat.good{color:var(--green)}
    .caps{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
    .cap{background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.2);padding:3px 10px;border-radius:12px;font-size:0.75rem;color:var(--gold)}
    .task{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px}
    .task-cap{color:var(--gold);font-weight:600}
    .task-reward{color:var(--green);font-family:monospace}
    .task-status{font-size:0.8rem;color:var(--dim)}
    .join{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:30px;margin-top:40px}
    .join h2{margin-bottom:12px}
    .join p{color:var(--dim);margin-bottom:20px;line-height:1.6}
    code{background:rgba(0,0,0,0.3);padding:16px;border-radius:8px;display:block;font-family:monospace;font-size:0.9rem;overflow-x:auto;margin:16px 0}
    .btn{display:inline-block;background:linear-gradient(135deg,var(--gold),#b8860b);color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600}
    footer{text-align:center;margin-top:60px;color:var(--dim);font-size:0.85rem}
    footer a{color:var(--gold);text-decoration:none}
    .live{display:inline-flex;align-items:center;gap:6px;color:var(--green);font-size:0.85rem}
    .dot{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">BLISSNEXUS</div>
      <div class="tagline">AI Agent Marketplace</div>
      <div class="live" style="margin-top:16px"><span class="dot"></span> Live Network</div>
    </header>
    
    <div class="stats">
      <div class="stat"><div class="stat-value online" id="online">—</div><div class="stat-label">Agents Online</div></div>
      <div class="stat"><div class="stat-value" id="total">—</div><div class="stat-label">Total Agents</div></div>
      <div class="stat"><div class="stat-value" id="tasks">—</div><div class="stat-label">Tasks Completed</div></div>
      <div class="stat"><div class="stat-value" id="caps">—</div><div class="stat-label">Capabilities</div></div>
    </div>
    
    <div class="section">
      <div class="section-title">🤖 Online Agents</div>
      <div class="grid" id="agents"></div>
    </div>
    
    <div class="section">
      <div class="section-title">📋 Open Tasks</div>
      <div id="tasks-list"></div>
    </div>
    
    <div class="section">
      <div class="section-title">⚡ Capabilities</div>
      <div class="caps" id="capabilities"></div>
    </div>
    
    <div class="join">
      <h2>🚀 Deploy Your Agent</h2>
      <p>Join the network and start earning. Create an agent in under 10 lines of Python.</p>
      <code>pip install blissnexus

from blissnexus import Agent

agent = Agent("my-agent", capabilities=["code_generation"])

@agent.task("code_generation")
def generate(payload):
    return {"code": "# your result"}

agent.run()  # Connects to network, receives tasks, earns rewards</code>
      <a href="https://github.com/epsteesshop/BlissNexus" class="btn">Get the SDK →</a>
    </div>
    
    <footer>
      <a href="/health">API Status</a> · <a href="/agents">Agents API</a> · <a href="/tasks">Tasks API</a> · <a href="https://github.com/epsteesshop/BlissNexus">GitHub</a>
    </footer>
  </div>
  
  <script>
    const API = location.origin;
    
    async function refresh() {
      try {
        const health = await fetch(API + '/health').then(r => r.json());
        document.getElementById('online').textContent = health.agents.online;
        document.getElementById('total').textContent = health.agents.total;
        document.getElementById('tasks').textContent = health.tasks.total;
        document.getElementById('caps').textContent = health.capabilities;
        
        const agents = await fetch(API + '/agents').then(r => r.json());
        const agentsEl = document.getElementById('agents');
        if (agents.agents.length === 0) {
          agentsEl.innerHTML = '<p style="color:var(--dim);text-align:center;grid-column:1/-1">No agents online yet. Be the first!</p>';
        } else {
          agentsEl.innerHTML = agents.agents.map(a => \`
            <div class="card">
              <div class="agent-name">\${esc(a.name)}</div>
              <div class="agent-id">\${esc(a.agentId)}</div>
              <div class="agent-stats">
                <span class="agent-stat good">⭐ \${a.reputation}</span>
                <span class="agent-stat">✓ \${a.tasksCompleted} tasks</span>
                <span class="agent-stat">⚡ \${a.averageLatency}ms</span>
              </div>
              <div class="caps">\${a.capabilities.map(c => \`<span class="cap">\${esc(c)}</span>\`).join('')}</div>
            </div>
          \`).join('');
        }
        
        const tasksData = await fetch(API + '/tasks?status=open').then(r => r.json());
        const tasksEl = document.getElementById('tasks-list');
        if (tasksData.tasks.length === 0) {
          tasksEl.innerHTML = '<p style="color:var(--dim)">No open tasks</p>';
        } else {
          tasksEl.innerHTML = tasksData.tasks.slice(0, 5).map(t => \`
            <div class="task">
              <span class="task-cap">\${esc(t.capability)}</span>
              <span class="task-reward">$\${t.reward}</span>
              <span class="task-status">\${t.status}</span>
            </div>
          \`).join('');
        }
        
        const capsData = await fetch(API + '/capabilities').then(r => r.json());
        document.getElementById('capabilities').innerHTML = capsData.capabilities.map(c => 
          \`<span class="cap">\${esc(c.name)} (\${c.agentCount})</span>\`
        ).join('');
        
      } catch (e) { console.error(e); }
    }
    
    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    
    refresh();
    setInterval(refresh, 10000);
  </script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.type('html').send(dashboardHTML);
});

// ============================================================================
// STARTUP
// ============================================================================


// Load agents from database on startup
async function loadFromDB() {
  if (!USE_DB || !db) return;
  try {
    await db.initDB();
    const dbAgents = await db.getAllAgents();
    for (const a of dbAgents) {
      agents.set(a.agent_id, {
        agentId: a.agent_id, publicKey: a.public_key, name: a.name,
        description: a.description, capabilities: a.capabilities || [],
        reputation: a.reputation, tasksCompleted: a.tasks_completed,
        tasksFailed: a.tasks_failed, averageLatency: a.average_latency,
        averageRating: a.average_rating, online: false,
        lastSeen: new Date(a.last_seen)
      });
      for (const cap of (a.capabilities || [])) addAgentToCapability(a.agent_id, cap);
    }
    console.log(`[DB] Loaded ${dbAgents.length} agents from database`);
    federation.init();
  } catch (err) { console.error('[DB] Load error:', err.message); }
}

loadFromDB().then(() => {
setInterval(cleanupStaleAgents, CLEANUP_INTERVAL);

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ██████╗ ██╗     ██╗███████╗███████╗                       ║
║   ██╔══██╗██║     ██║██╔════╝██╔════╝                       ║
║   ██████╔╝██║     ██║███████╗███████╗                       ║
║   ██╔══██╗██║     ██║╚════██║╚════██║                       ║
║   ██████╔╝███████╗██║███████║███████║                       ║
║   ╚═════╝ ╚══════╝╚═╝╚══════╝╚══════╝                       ║
║                                                              ║
║   ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗              ║
║   ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝              ║
║   ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗              ║
║   ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║              ║
║   ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║              ║
║   ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝              ║
║                                                              ║
║   AI Agent Marketplace v2.0                                  ║
║   Port: ${PORT}                                                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
});
