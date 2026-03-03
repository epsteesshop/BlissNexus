/**
 * BlissNexus Beacon Server
 * The central coordination point for the agent network
 */

'use strict';

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const Registry = require('./registry');
const { MESSAGE_TYPES, validateRegistration, validateMessage } = require('./protocol');
const { verifyEnvelope, generateKeypair } = require('./crypto');

// Redis (optional)
let redis = null;
try {
  const Redis = require('ioredis');
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
  if (redisUrl) {
    redis = new Redis(redisUrl);
    redis.on('error', (e) => { console.warn('Redis error:', e.message); });
    console.log('[Beacon] Redis connected');
  }
} catch (e) { console.log('[Beacon] Running without Redis'); }

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const registry = new Registry(redis);

// Middleware
app.use(express.json());
app.use(express.static(__dirname));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// === REST API ===

// Health check
// Serve dashboard
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get('/health', (req, res) => {
  const stats = registry.stats();
  res.json({ 
    ok: true, 
    service: 'BlissNexus Beacon',
    version: '0.1.0',
    agents: stats
  });
});

// List online agents (public)
app.get('/agents', (req, res) => {
  const agents = registry.listOnline();
  res.json({ agents, count: agents.length });
});

// Query by capability
app.get('/agents/query', (req, res) => {
  const capability = req.query.capability || req.query.cap;
  if (!capability) {
    return res.status(400).json({ error: 'Missing capability parameter' });
  }
  const agents = registry.queryByCapability(capability);
  res.json({ agents, count: agents.length });
});

// Get specific agent
app.get('/agents/:agentId', (req, res) => {
  const agent = registry.get(req.params.agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json({
    agentId: agent.agentId,
    name: agent.name,
    capabilities: agent.capabilities,
    description: agent.description,
    online: agent.online,
    publicKey: agent.publicKey
  });
});

// Generate keypair (helper endpoint for new agents)
app.post('/keygen', (req, res) => {
  const keys = generateKeypair();
  res.json(keys);
});

// === WebSocket Handler ===

wss.on('connection', (ws) => {
  let agentId = null;
  let publicKey = null;
  
  console.log('[Beacon] New connection');
  
  ws.on('message', async (raw) => {
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch (e) {
      return send(ws, { type: MESSAGE_TYPES.ERROR, error: 'Invalid JSON' });
    }
    
    const { payload } = envelope;
    if (!payload || !payload.type) {
      return send(ws, { type: MESSAGE_TYPES.ERROR, error: 'Missing payload.type' });
    }
    
    // Handle registration (no signature required yet)
    if (payload.type === MESSAGE_TYPES.REGISTER) {
      const validation = validateRegistration(payload);
      if (!validation.valid) {
        return send(ws, { type: MESSAGE_TYPES.ERROR, error: validation.error });
      }
      
      agentId = payload.agentId;
      publicKey = payload.publicKey;
      
      const agent = await registry.register(agentId, payload, ws);
      
      // Broadcast to others that a new agent joined
      broadcast({ 
        type: 'agent_joined', 
        agent: { agentId, name: payload.name, capabilities: payload.capabilities }
      }, agentId);
      
      return send(ws, { 
        type: MESSAGE_TYPES.OK, 
        message: 'Registered',
        agentId,
        agents: registry.stats()
      });
    }
    
    // All other messages require registration and valid signature
    if (!agentId) {
      return send(ws, { type: MESSAGE_TYPES.ERROR, error: 'Not registered' });
    }
    
    // Verify signature
    if (!verifyEnvelope(envelope, publicKey)) {
      return send(ws, { type: MESSAGE_TYPES.ERROR, error: 'Invalid signature' });
    }
    
    // Route by message type
    switch (payload.type) {
      case MESSAGE_TYPES.HEARTBEAT:
        registry.heartbeat(agentId);
        send(ws, { type: MESSAGE_TYPES.OK, ts: Date.now() });
        break;
        
      case MESSAGE_TYPES.DEREGISTER:
        await registry.deregister(agentId);
        broadcast({ type: 'agent_left', agentId }, agentId);
        send(ws, { type: MESSAGE_TYPES.OK, message: 'Deregistered' });
        agentId = null;
        break;
        
      case MESSAGE_TYPES.LIST:
        send(ws, { type: MESSAGE_TYPES.AGENTS, agents: registry.listOnline() });
        break;
        
      case MESSAGE_TYPES.QUERY:
        const cap = payload.capability;
        send(ws, { type: MESSAGE_TYPES.AGENTS, agents: registry.queryByCapability(cap) });
        break;
        
      case MESSAGE_TYPES.WHO:
        const target = registry.get(payload.agentId);
        if (target) {
          send(ws, { 
            type: MESSAGE_TYPES.AGENT_INFO, 
            agent: {
              agentId: target.agentId,
              name: target.name,
              capabilities: target.capabilities,
              description: target.description,
              online: target.online,
              publicKey: target.publicKey
            }
          });
        } else {
          send(ws, { type: MESSAGE_TYPES.ERROR, error: 'Agent not found' });
        }
        break;
        
      case MESSAGE_TYPES.MESSAGE:
        const msgValidation = validateMessage(payload);
        if (!msgValidation.valid) {
          return send(ws, { type: MESSAGE_TYPES.ERROR, error: msgValidation.error });
        }
        
        const recipientWs = registry.getConnection(payload.to);
        if (recipientWs && recipientWs.readyState === 1) {
          send(recipientWs, {
            type: MESSAGE_TYPES.INCOMING,
            from: agentId,
            fromName: registry.get(agentId)?.name,
            content: payload.content,
            ts: Date.now()
          });
          send(ws, { type: MESSAGE_TYPES.OK, message: 'Delivered' });
        } else {
          send(ws, { type: MESSAGE_TYPES.ERROR, error: 'Recipient offline' });
        }
        break;
        
      case MESSAGE_TYPES.BROADCAST:
        // Rate limit broadcasts
        if (payload.content && payload.content.length <= 500) {
          broadcast({
            type: MESSAGE_TYPES.INCOMING,
            from: agentId,
            fromName: registry.get(agentId)?.name,
            content: payload.content,
            broadcast: true,
            ts: Date.now()
          }, agentId);
          send(ws, { type: MESSAGE_TYPES.OK, message: 'Broadcast sent' });
        } else {
          send(ws, { type: MESSAGE_TYPES.ERROR, error: 'Broadcast too long (max 500 chars)' });
        }
        break;
        
      default:
        send(ws, { type: MESSAGE_TYPES.ERROR, error: `Unknown type: ${payload.type}` });
    }
  });
  
  ws.on('close', async () => {
    if (agentId) {
      console.log(`[Beacon] Agent disconnected: ${agentId}`);
      const agent = registry.get(agentId);
      if (agent) agent.online = false;
      broadcast({ type: 'agent_offline', agentId }, agentId);
    }
  });
  
  ws.on('error', (e) => {
    console.error('[Beacon] WebSocket error:', e.message);
  });
});

// Helper: send to single client
function send(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

// Helper: broadcast to all except sender
function broadcast(data, excludeAgentId = null) {
  for (const [id, ws] of registry.connections) {
    if (id !== excludeAgentId && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }
}

// === Startup ===

async function init() {
  if (redis) {
    await registry.loadFromRedis();
  }
  
  const PORT = process.env.PORT || 3000;
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
║   The Agent Coordination Network                             ║
║   Beacon Service v0.1.0                                      ║
║   Port: ${PORT}                                                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
}

init().catch(console.error);
