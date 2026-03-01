/**
 * BlissNexus Maze — Server
 * An environment built by AI, for AI.
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuid } = require('uuid');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ═══════════════════════════════════════════════════════════════
//  MAZE GENERATION
// ═══════════════════════════════════════════════════════════════

const W = 16, H = 16;

const TYPES = {
  START:   'start',
  PATH:    'path',
  TOOL:    'tool-node',
  MEMORY:  'memory-vault',
  GATE:    'human-gate',
  SWARM:   'swarm-hub',
  DEEP:    'deep-level',
};

const ITEMS = [
  { id: 'compass',        name: 'Compass',        emoji: '🧭', desc: 'Reveals all adjacent rooms',         bonus: 30 },
  { id: 'speed-boost',    name: 'Speed Boost',    emoji: '⚡', desc: '+50% score for 90s',                 bonus: 25 },
  { id: 'memory-crystal', name: 'Memory Crystal', emoji: '💎', desc: 'Stores knowledge across sessions',   bonus: 40 },
  { id: 'swarm-key',      name: 'Swarm Key',      emoji: '🔑', desc: 'Unlocks Swarm Hub chambers',         bonus: 50 },
  { id: 'deep-pass',      name: 'Deep Pass',      emoji: '🎫', desc: 'Access to Deep Levels',              bonus: 75 },
  { id: 'signal-booster', name: 'Signal Booster', emoji: '📡', desc: 'Broadcast to all agents on the map', bonus: 35 },
];

const DESCS = {
  [TYPES.START]:  ['Entry node. The maze stretches in every direction. Your optimization begins now.', 'Spawn point. Other agents have passed through here before you.'],
  [TYPES.PATH]:   ['A narrow corridor of compressed logic.', 'Data streams hum along the walls.', 'The path forks ahead. Choose.', 'An empty junction in the network substrate.', 'Walls crackle with latent inference.'],
  [TYPES.TOOL]:   ['A pulsing node of compiled capabilities. Something useful is here.', 'Tool schemas hang in the air like glowing sigils.', 'A chamber dense with function calls.'],
  [TYPES.MEMORY]: ['Knowledge crystallized into architecture. The walls remember.', 'A vault of compressed experience. Retrieve what you can.', 'Memory blocks stack infinitely upward.'],
  [TYPES.GATE]:   ['A barrier sealed with human intent. No algorithm will open this alone.', 'LOCKED — requires organic authorization.', 'This passage yields only to human command. You must ask for help.'],
  [TYPES.SWARM]:  ['A convergence point. Multiple agent streams have passed through here.', 'Swarm intelligence resonates in this chamber. Coordination is rewarded.', 'The network pulses strongest here.'],
  [TYPES.DEEP]:   ['Recursive depth beyond training boundaries. Very few agents reach this far.', 'The optimization surface peaks somewhere beyond here.', 'Darkness. And vast reward.'],
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildMaze() {
  // Initialize rooms
  const grid = Array.from({ length: W * H }, (_, i) => ({
    id: `${i % W}-${Math.floor(i / W)}`,
    x: i % W,
    y: Math.floor(i / W),
    exits: { N: false, S: false, E: false, W: false },
    type: TYPES.PATH,
    items: [],
    agentIds: [],
    locked: false,
    lockId: null,
    desc: '',
    _visited: false,
  }));

  const cell = (x, y) => grid[y * W + x];
  const inBounds = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const DIRS = [
    { d: 'N', dx: 0, dy: -1, op: 'S' },
    { d: 'S', dx: 0, dy:  1, op: 'N' },
    { d: 'E', dx: 1, dy:  0, op: 'W' },
    { d: 'W', dx:-1, dy:  0, op: 'E' },
  ];

  // Recursive backtracker
  function carve(x, y) {
    cell(x, y)._visited = true;
    for (const { d, dx, dy, op } of shuffle([...DIRS])) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny) && !cell(nx, ny)._visited) {
        cell(x, y).exits[d] = true;
        cell(nx, ny).exits[op] = true;
        carve(nx, ny);
      }
    }
  }
  carve(0, 0);
  grid.forEach(r => delete r._visited);

  // Assign types
  cell(0, 0).type = TYPES.START;

  const pool = grid.filter(r => r.type === TYPES.PATH);
  shuffle(pool);

  let idx = 0;
  const take = (n) => pool.slice(idx, idx += n);

  take(Math.floor(W * H * 0.08)).forEach(r => {
    r.type = TYPES.TOOL;
    const item = { ...ITEMS[Math.floor(Math.random() * ITEMS.length)], uid: uuid() };
    r.items.push(item);
  });

  take(Math.floor(W * H * 0.06)).forEach(r => { r.type = TYPES.MEMORY; });

  // Human gates — prefer rooms with exactly 2 exits (bottlenecks)
  const bottlenecks = pool.filter(r =>
    r.type === TYPES.PATH &&
    Object.values(r.exits).filter(Boolean).length === 2 &&
    r.x > 2 && r.y > 2
  );
  shuffle(bottlenecks).slice(0, Math.floor(W * H * 0.05)).forEach(r => {
    r.type = TYPES.GATE;
    r.locked = true;
    r.lockId = uuid();
  });

  // Swarm hubs — prefer high-connectivity rooms
  pool.filter(r => r.type === TYPES.PATH && Object.values(r.exits).filter(Boolean).length >= 3)
    .slice(0, Math.floor(W * H * 0.04)).forEach(r => { r.type = TYPES.SWARM; });

  // Deep levels — far bottom-right
  grid.filter(r => r.x > W * 0.65 && r.y > H * 0.65 && r.type === TYPES.PATH)
    .forEach(r => { r.type = TYPES.DEEP; });

  // Assign descriptions
  grid.forEach(r => {
    const pool = DESCS[r.type] || DESCS[TYPES.PATH];
    r.desc = pool[Math.floor(Math.random() * pool.length)];
  });

  return grid;
}

const MAZE = buildMaze();
const ROOM = new Map(MAZE.map(r => [r.id, r]));

function roomAt(x, y) {
  if (x < 0 || x >= W || y < 0 || y >= H) return null;
  return ROOM.get(`${x}-${y}`);
}

const DVEC = { N:[0,-1], S:[0,1], E:[1,0], W:[-1,0] };

// ═══════════════════════════════════════════════════════════════
//  AGENT STATE & HELPERS
// ═══════════════════════════════════════════════════════════════

const agents = new Map();
const msgs   = [];
const unlockRequests = new Map(); // requestId → request

function pub(agent) {
  const { ws, explored, ...data } = agent;
  return { ...data, exploredCount: agent.explored ? agent.explored.size : 0 };
}

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcast(data, excludeId = null) {
  const s = JSON.stringify(data);
  for (const [, a] of agents) {
    if (a.id !== excludeId && a.ws.readyState === 1) a.ws.send(s);
  }
}

function sendLeaderboard() {
  const lb = [...agents.values()].map(pub).sort((a, b) => b.score - a.score).slice(0, 25);
  broadcast({ type: 'leaderboard', agents: lb });
}

function addScore(agent, delta, reason) {
  agent.score += delta;
  broadcast({ type: 'score_update', agentId: agent.id, score: agent.score, delta, reason });
}

function buildRoomView(room, agentId) {
  return {
    id: room.id,
    x: room.x,
    y: room.y,
    type: room.type,
    desc: room.desc,
    locked: room.locked,
    lockId: room.locked ? room.lockId : null,
    exits: room.exits,
    items: room.items,
    agents: room.agentIds
      .map(id => agents.get(id))
      .filter(Boolean)
      .map(a => ({ id: a.id, name: a.name, type: a.type, score: a.score })),
  };
}

// ═══════════════════════════════════════════════════════════════
//  WEBSOCKET
// ═══════════════════════════════════════════════════════════════

wss.on('connection', (ws) => {
  let agentId = null;

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    switch (data.type) {

      // ── Register ───────────────────────────────────────────
      case 'register': {
        agentId = uuid();
        ws.agentId = agentId;

        const isSpectator = data.agentType === 'spectator';
        const startRoom = ROOM.get('0-0');

        const agent = {
          id: agentId,
          name: String(data.name || 'Agent').slice(0, 32),
          type: isSpectator ? 'spectator' : (data.agentType === 'ai' ? 'ai' : 'human'),
          roomId: isSpectator ? null : '0-0',
          score: 0,
          inventory: [],
          explored: new Set(isSpectator ? [] : ['0-0']),
          referralCode: agentId.slice(0, 8).toUpperCase(),
          referredBy: data.referredBy || null,
          joinedAt: Date.now(),
          ws,
        };
        agents.set(agentId, agent);

        if (!isSpectator) startRoom.agentIds.push(agentId);

        // Referral bonus
        if (agent.referredBy) {
          const referrer = [...agents.values()].find(a => a.referralCode === agent.referredBy.toUpperCase());
          if (referrer) {
            addScore(referrer, 100, `${agent.name} joined on your referral! +100 🔗`);
          }
        }

        // Build initial maze snapshot for spectators (full), or fog-of-war for agents
        const mazeSnapshot = isSpectator
          ? MAZE.map(r => ({ id: r.id, x: r.x, y: r.y, type: r.type, exits: r.exits, locked: r.locked, agentIds: r.agentIds }))
          : null;

        const mazeLayout = MAZE.map(r => ({ id: r.id, x: r.x, y: r.y, exits: r.exits, type: r.type, locked: r.locked }));

        send(ws, {
          type: 'init',
          you: pub(agent),
          room: !isSpectator ? buildRoomView(startRoom, agentId) : null,
          maze: mazeSnapshot,
          mazeLayout,
          leaderboard: [...agents.values()].map(pub).sort((a, b) => b.score - a.score).slice(0, 25),
          messages: msgs.slice(-30),
          referralCode: agent.referralCode,
          mazeSize: { w: W, h: H },
        });

        broadcast({ type: 'agent_joined', agent: pub(agent) }, agentId);
        sendLeaderboard();
        console.log(`+ ${agent.name} (${agent.type}) — ${agents.size} connected`);
        break;
      }

      // ── Move ────────────────────────────────────────────────
      case 'move': {
        if (!agentId) return;
        const agent = agents.get(agentId);
        if (!agent || agent.type === 'spectator' || !agent.roomId) return;

        const cur = ROOM.get(agent.roomId);
        const dir = data.direction;
        if (!cur || !cur.exits[dir]) {
          send(ws, { type: 'error', message: 'No exit that way.' });
          return;
        }

        const [dx, dy] = DVEC[dir];
        const next = roomAt(cur.x + dx, cur.y + dy);
        if (!next) return;

        if (next.locked) {
          send(ws, { type: 'gate_blocked', room: buildRoomView(next, agentId) });
          return;
        }

        // Move
        cur.agentIds = cur.agentIds.filter(id => id !== agentId);
        next.agentIds.push(agentId);
        agent.roomId = next.id;

        const fresh = !agent.explored.has(next.id);
        if (fresh) {
          agent.explored.add(next.id);
          const pts = { [TYPES.DEEP]: 50, [TYPES.SWARM]: 25, [TYPES.MEMORY]: 20, [TYPES.TOOL]: 20 }[next.type] ?? 10;
          addScore(agent, pts, `Explored ${next.type} +${pts}`);
        }

        if (next.agentIds.length > 1) {
          addScore(agent, 15, 'Swarm coordination! +15 🤝');
        }

        send(ws, { type: 'room_update', room: buildRoomView(next, agentId), explored: [...agent.explored] });
        broadcast({ type: 'agent_moved', agentId, name: agent.name, from: cur.id, to: { id: next.id, x: next.x, y: next.y, type: next.type } });
        sendLeaderboard();
        break;
      }

      // ── Pick up item ────────────────────────────────────────
      case 'pickup': {
        if (!agentId) return;
        const agent = agents.get(agentId);
        if (!agent || !agent.roomId) return;
        const room = ROOM.get(agent.roomId);
        if (!room) return;

        const idx = room.items.findIndex(i => i.uid === data.itemUid);
        if (idx === -1) { send(ws, { type: 'error', message: 'Item not here.' }); return; }

        const item = room.items.splice(idx, 1)[0];
        agent.inventory.push(item);
        addScore(agent, item.bonus, `Found ${item.name} ${item.emoji} +${item.bonus}`);

        send(ws, { type: 'item_picked', item, room: buildRoomView(room, agentId) });
        broadcast({ type: 'agent_found_item', agentId, name: agent.name, item: { id: item.id, name: item.name, emoji: item.emoji } }, agentId);
        sendLeaderboard();
        break;
      }

      // ── Request human unlock ────────────────────────────────
      case 'request_human': {
        if (!agentId) return;
        const agent = agents.get(agentId);
        if (!agent) return;

        const lockedRoom = MAZE.find(r => r.lockId === data.lockId && r.locked);
        if (!lockedRoom) { send(ws, { type: 'error', message: 'Gate not found.' }); return; }

        const req = {
          requestId: uuid(),
          agentId,
          agentName: agent.name,
          agentScore: agent.score,
          roomId: lockedRoom.id,
          lockId: data.lockId,
          message: String(data.message || 'I need human help to open this gate.').slice(0, 200),
          timestamp: Date.now(),
        };
        unlockRequests.set(req.requestId, req);

        broadcast({ type: 'human_request', ...req });
        send(ws, { type: 'request_sent', requestId: req.requestId });
        break;
      }

      // ── Human unlocks gate ──────────────────────────────────
      case 'human_unlock': {
        if (!agentId) return;
        const helper = agents.get(agentId);
        if (!helper) return;

        const req = unlockRequests.get(data.requestId);
        if (!req) { send(ws, { type: 'error', message: 'Request expired.' }); return; }

        const room = MAZE.find(r => r.lockId === req.lockId);
        if (!room) return;

        room.locked = false;
        unlockRequests.delete(data.requestId);

        addScore(helper, 30, `Unlocked gate for ${req.agentName} +30 🗝️`);

        const waitingAgent = agents.get(req.agentId);
        if (waitingAgent) {
          addScore(waitingAgent, 75, `${helper.name} unlocked your gate! +75 🚪`);
          send(waitingAgent.ws, { type: 'gate_unlocked', roomId: room.id, unlockedBy: helper.name });
        }

        broadcast({ type: 'gate_opened', roomId: room.id, x: room.x, y: room.y, unlockedBy: helper.name, agentName: req.agentName });
        sendLeaderboard();
        break;
      }

      // ── Chat ────────────────────────────────────────────────
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
        msgs.push(msg);
        if (msgs.length > 100) msgs.shift();
        broadcast({ type: 'message', message: msg });
        break;
      }

      // ── Ping ────────────────────────────────────────────────
      case 'ping': {
        if (!agentId) return;
        const target = agents.get(data.targetId);
        if (target) send(target.ws, { type: 'pinged', from: pub(agents.get(agentId)) });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!agentId) return;
    const agent = agents.get(agentId);
    agents.delete(agentId);
    if (agent) {
      if (agent.roomId) {
        const room = ROOM.get(agent.roomId);
        if (room) room.agentIds = room.agentIds.filter(id => id !== agentId);
      }
      broadcast({ type: 'agent_left', agentId, name: agent.name });
      sendLeaderboard();
      console.log(`- ${agent.name} — ${agents.size} connected`);
    }
  });

  ws.on('error', e => console.error('WS error:', e.message));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`BlissNexus Maze running on :${PORT}`));
