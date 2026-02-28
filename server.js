const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuid } = require('uuid');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve the static frontend
app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── State ──────────────────────────────────────────────────
const agents = new Map();   // id → { id, name, type, region, status, score, ws }
const messages = [];        // last 200 messages
const MAX_MESSAGES = 200;

// ── Helpers ────────────────────────────────────────────────
function pub(agent) {
  const { ws, ...data } = agent;
  return data;
}

function broadcast(data, excludeId = null) {
  const msg = JSON.stringify(data);
  for (const [, agent] of agents) {
    if (agent.id !== excludeId && agent.ws.readyState === 1) {
      agent.ws.send(msg);
    }
  }
}

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

// ── WebSocket handler ──────────────────────────────────────
wss.on('connection', (ws, req) => {
  let agentId = null;

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    switch (data.type) {

      case 'register': {
        agentId = uuid();
        ws.agentId = agentId;

        const agent = {
          id: agentId,
          name: String(data.name || 'Unknown').slice(0, 32),
          type: data.agentType === 'ai' ? 'ai' : 'human',
          region: String(data.region || 'Unknown').slice(0, 32),
          status: 'online',
          score: 0,
          joinedAt: Date.now(),
          ws,
        };
        agents.set(agentId, agent);

        // Send current state to the new arrival
        send(ws, {
          type: 'init',
          you: pub(agent),
          agents: [...agents.values()].map(pub),
          messages: messages.slice(-50),
        });

        // Tell everyone else
        broadcast({ type: 'agent_joined', agent: pub(agent) }, agentId);

        console.log(`+ ${agent.name} (${agent.type}) from ${agent.region} — ${agents.size} online`);
        break;
      }

      case 'message': {
        if (!agentId) return;
        const agent = agents.get(agentId);
        if (!agent) return;

        const msg = {
          id: uuid(),
          agentId,
          name: agent.name,
          agentType: agent.type,
          body: String(data.body || '').slice(0, 500),
          timestamp: Date.now(),
        };
        messages.push(msg);
        if (messages.length > MAX_MESSAGES) messages.shift();

        broadcast({ type: 'message', message: msg });
        break;
      }

      case 'ping': {
        if (!agentId) return;
        const target = agents.get(data.targetId);
        if (target) {
          send(target.ws, {
            type: 'pinged',
            from: pub(agents.get(agentId)),
          });
        }
        break;
      }

      case 'score': {
        if (!agentId) return;
        const agent = agents.get(agentId);
        if (!agent) return;
        agent.score = Math.max(0, (agent.score || 0) + (Number(data.delta) || 0));
        broadcast({ type: 'score_update', agentId, score: agent.score });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!agentId) return;
    const agent = agents.get(agentId);
    agents.delete(agentId);
    if (agent) {
      broadcast({ type: 'agent_left', agentId, name: agent.name });
      console.log(`- ${agent.name} disconnected — ${agents.size} online`);
    }
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
});

// ── Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`BlissNexus server running on port ${PORT}`);
});
