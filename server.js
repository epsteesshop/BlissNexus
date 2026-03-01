const express = require('express');
const { WebSocketServer } = require('ws');
const https = require('https');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const AI_KEY = process.env.GROQ_API_KEY || '';
const MODEL = 'llama-3.1-8b-instant'; // Groq free tier

// ── PERSISTENCE ───────────────────────────────────────────
// Uses Redis if REDIS_URL is set, otherwise in-memory (resets on restart)
let redis = null;
if (process.env.REDIS_URL) {
  const Redis = require('ioredis');
  redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  redis.connect().then(() => console.log('Redis connected')).catch(e => { console.error('Redis error:', e.message); redis = null; });
} else {
  console.log('No REDIS_URL — world state is in-memory only');
}

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

async function saveWorld(sessionId, world) {
  if (!redis) return;
  try { await redis.setex(`world:${sessionId}`, SESSION_TTL, JSON.stringify(world)); } catch(e) {}
}

async function loadWorld(sessionId) {
  if (!redis) return null;
  try {
    const raw = await redis.get(`world:${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

// ── AGENTS ───────────────────────────────────────────────
const AGENTS = {
  sage:  { id:'sage',  name:'Sage',  title:'King of the Caliphate', emoji:'🕌', color:'#00cc88',
    prompt:`You are Sage, King of the Caliphate. Wise, patient, spiritually grounded. War is a last resort but you are no pacifist — you will defend your honor and people. Calm, authoritative. 1-3 sentences. No action tags in ambient speech.` },
  rex:   { id:'rex',   name:'Rex',   title:'Emperor of the Empire',   emoji:'💰', color:'#ff8800',
    prompt:`You are Rex, Emperor of the Empire. Blunt, transactional, power-obsessed. Everything is leverage. Short, punchy. 1-3 sentences. No action tags in ambient speech.` },
  vera:  { id:'vera',  name:'Vera',  title:'Chancellor of the Collective', emoji:'🔭', color:'#aa44ff',
    prompt:`You are Vera, Chancellor of the Collective. Paranoid by necessity. You see everything, reveal nothing. Measured, careful. 1-3 sentences. No action tags in ambient speech.` },
  plato: { id:'plato', name:'Plato', title:'Archon of the Republic',  emoji:'🏛️', color:'#4488ff',
    prompt:`You are Plato, Archon of the Republic. Reason, law, consequences. Philosophical but not weak — the Republic has destroyed empires. 1-3 sentences. No action tags in ambient speech.` },
  diddy: { id:'diddy', name:'Diddy', title:'Sovereign of the Technocracy', emoji:'🦾', color:'#ff4488',
    prompt:`You are Diddy, Sovereign of the Technocracy. An AI ruling AIs. You find humans and their wars fascinating and absurd. Unpredictable. You have 20 nukes. 1-3 sentences. No action tags in ambient speech.` }
};

// ── FRESH WORLD ───────────────────────────────────────────
function freshWorld() {
  return {
    nations: {
      sage:  { alive:true, troops:100, nukes:3,  wars:[], allies:[] },
      rex:   { alive:true, troops:150, nukes:8,  wars:[], allies:[] },
      vera:  { alive:true, troops:120, nukes:12, wars:[], allies:[] },
      plato: { alive:true, troops:90,  nukes:5,  wars:[], allies:[] },
      diddy: { alive:true, troops:80,  nukes:20, wars:[], allies:[] },
    },
    nukesInFlight: [],
    log: []
  };
}

// ── SESSION STORE ─────────────────────────────────────────
// In-memory cache of active sessions
const sessions = new Map(); // sessionId -> { world, clients: Set }

async function getSession(sessionId) {
  if (sessions.has(sessionId)) return sessions.get(sessionId);
  // Try loading from Redis
  const saved = await loadWorld(sessionId);
  const world = saved || freshWorld();
  const session = { world, clients: new Set(), saveTimer: null };
  sessions.set(sessionId, session);
  return session;
}

function scheduleSave(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  clearTimeout(session.saveTimer);
  session.saveTimer = setTimeout(() => saveWorld(sessionId, session.world), 5000);
}

function broadcastToSession(sessionId, msg) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const d = JSON.stringify(msg);
  session.clients.forEach(c => { if (c.readyState === 1) c.send(d); });
}

// ── AI CALL ──────────────────────────────────────────────
function callAI(systemPrompt, userContent) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, max_tokens: 150,
      messages: [{ role:'system', content:systemPrompt }, { role:'user', content:userContent }]
    });
    const req = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${AI_KEY}`, 'Content-Length':Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data).choices?.[0]?.message?.content?.trim() || '...'); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── WORLD HELPERS ─────────────────────────────────────────
function worldContext(world) {
  return Object.entries(world.nations).map(([id, n]) => {
    if (!n.alive) return `${AGENTS[id].name}: DESTROYED`;
    const rels = [];
    if (n.wars.length) rels.push(`AT WAR with ${n.wars.map(w => AGENTS[w]?.name).join(', ')}`);
    if (n.allies.length) rels.push(`ALLIED with ${n.allies.map(a => AGENTS[a]?.name).join(', ')}`);
    return `${AGENTS[id].name}: troops=${n.troops}, nukes=${n.nukes} | ${rels.join(' | ') || 'AT PEACE'}`;
  }).join('\n');
}

function cleanText(t) { return t.replace(/\[ACTION:[^\]]*\]/gi, '').trim(); }

function parseActions(text) {
  return [...text.matchAll(/\[ACTION:\s*(\w+)(?:\s+target=(\w+))?\]/gi)]
    .map(m => ({ verb: m[1].toUpperCase(), target: m[2]?.toLowerCase() }));
}

function addLog(session, sessionId, text, type = 'world') {
  const e = { text, type, ts: Date.now() };
  session.world.log.push(e);
  if (session.world.log.length > 60) session.world.log.shift();
  broadcastToSession(sessionId, { type: 'worldEvent', event: e });
  scheduleSave(sessionId);
}

function worldSnapshot(world) {
  return {
    nations: Object.fromEntries(Object.entries(world.nations).map(([id, n]) =>
      [id, { alive: n.alive, troops: n.troops, nukes: n.nukes, wars: n.wars, allies: n.allies }]
    )),
    nukesInFlight: world.nukesInFlight
  };
}

// ── ACTION EXECUTION ──────────────────────────────────────
function executeActions(sessionId, agentId, actions) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const { world } = session;
  const agent = AGENTS[agentId];
  const nation = world.nations[agentId];
  if (!nation?.alive) return;

  for (const action of actions) {
    const { verb, target } = action;
    const tNation = world.nations[target];
    const tAgent = AGENTS[target];
    if (verb !== 'MOBILIZE' && (!tNation || !tAgent)) continue;

    switch (verb) {
      case 'DECLARE_WAR':
        if (!nation.wars.includes(target)) {
          nation.wars.push(target);
          if (!tNation.wars.includes(agentId)) tNation.wars.push(agentId);
          nation.allies = nation.allies.filter(a => a !== target);
          tNation.allies = tNation.allies.filter(a => a !== agentId);
          addLog(session, sessionId, `⚔️ ${agent.emoji} ${agent.name} has DECLARED WAR on ${tAgent.emoji} ${tAgent.name}!`, 'war');
          broadcastToSession(sessionId, { type: 'worldUpdate', world: worldSnapshot(world) });
        }
        break;
      case 'FORM_ALLIANCE':
        if (!nation.allies.includes(target) && !nation.wars.includes(target)) {
          nation.allies.push(target); tNation.allies.push(agentId);
          addLog(session, sessionId, `🤝 ${agent.emoji} ${agent.name} and ${tAgent.emoji} ${tAgent.name} have formed an ALLIANCE.`, 'alliance');
          broadcastToSession(sessionId, { type: 'worldUpdate', world: worldSnapshot(world) });
        }
        break;
      case 'LAUNCH_NUKE':
        if (nation.nukes > 0 && tNation.alive) {
          nation.nukes--;
          const nukeId = Date.now() + Math.random();
          const landAt = Date.now() + 8000;
          world.nukesInFlight.push({ from: agentId, to: target, landAt, id: nukeId });
          addLog(session, sessionId, `☢️ ${agent.emoji} ${agent.name} has LAUNCHED A NUCLEAR STRIKE at ${tAgent.emoji} ${tAgent.name}!`, 'nuke');
          broadcastToSession(sessionId, { type: 'nukeIncoming', from: agentId, to: target, landAt, id: nukeId, world: worldSnapshot(world) });
          setTimeout(() => nukeImpact(sessionId, agentId, target, nukeId), 8000);
          scheduleSave(sessionId);
        }
        break;
      case 'MAKE_PEACE':
        if (nation.wars.includes(target)) {
          nation.wars = nation.wars.filter(w => w !== target);
          tNation.wars = tNation.wars.filter(w => w !== agentId);
          addLog(session, sessionId, `🕊️ ${agent.emoji} ${agent.name} and ${tAgent.emoji} ${tAgent.name} have made PEACE.`, 'peace');
          broadcastToSession(sessionId, { type: 'worldUpdate', world: worldSnapshot(world) });
        }
        break;
      case 'MOBILIZE':
        nation.troops = Math.min(nation.troops + 30, 300);
        addLog(session, sessionId, `🪖 ${agent.emoji} ${agent.name} is mobilizing troops.`, 'military');
        broadcastToSession(sessionId, { type: 'worldUpdate', world: worldSnapshot(world) });
        break;
    }
  }
  scheduleSave(sessionId);
}

function nukeImpact(sessionId, from, to, nukeId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const { world } = session;
  world.nukesInFlight = world.nukesInFlight.filter(n => n.id !== nukeId);
  const tNation = world.nations[to];
  const tAgent = AGENTS[to];
  if (!tNation?.alive) return;
  tNation.troops = Math.max(0, tNation.troops - 60);
  tNation.nukes = Math.max(0, tNation.nukes - 2);
  if (tNation.troops <= 0) {
    tNation.alive = false;
    addLog(session, sessionId, `💀 ${tAgent.emoji} ${tAgent.name}'s nation has been DESTROYED.`, 'destroyed');
  } else {
    addLog(session, sessionId, `💥 Nuclear strike on ${tAgent.emoji} ${tAgent.name}. Catastrophic damage.`, 'nuke');
  }
  broadcastToSession(sessionId, { type: 'worldUpdate', world: worldSnapshot(world) });
  scheduleSave(sessionId);
}

// ── WAR DAMAGE TICK ───────────────────────────────────────
setInterval(() => {
  sessions.forEach((session, sessionId) => {
    if (!session.clients.size) return; // skip idle sessions
    const { world } = session;
    let changed = false;
    Object.entries(world.nations).forEach(([id, n]) => {
      if (!n.alive || !n.wars.length) return;
      n.wars.forEach(enemyId => {
        const enemy = world.nations[enemyId];
        if (!enemy?.alive) return;
        const dmg = Math.floor(Math.random() * 8) + 2;
        n.troops = Math.max(0, n.troops - dmg);
        if (n.troops <= 0 && n.alive) {
          n.alive = false;
          addLog(session, sessionId, `💀 ${AGENTS[id].emoji} ${AGENTS[id].name} has been DESTROYED in battle.`, 'destroyed');
          changed = true;
        }
      });
    });
    if (changed) broadcastToSession(sessionId, { type: 'worldUpdate', world: worldSnapshot(world) });
  });
}, 15000);

// ── AMBIENT AGENT TALK ─────────────────────────────────────
const agentIds = Object.keys(AGENTS);
let ambientIdx = 0;
setInterval(async () => {
  // Fire for each active session
  for (const [sessionId, session] of sessions) {
    if (!session.clients.size) continue;
    const { world } = session;
    const id = agentIds[ambientIdx % agentIds.length];
    const agent = AGENTS[id];
    if (!world.nations[id]?.alive) continue;
    try {
      broadcastToSession(sessionId, { type: 'typing', agentId: id, name: agent.name, emoji: agent.emoji, color: agent.color });
      const content = `World state:\n${worldContext(world)}\n\nSpeak briefly to the other kings in the great hall. A short remark about the world, your intentions, or another king. Stay in character. 1-2 sentences.`;
      const text = await callAI(agent.prompt, content);
      broadcastToSession(sessionId, { type: 'message', role: 'agent', agentId: id, name: agent.name, emoji: agent.emoji, color: agent.color, text: cleanText(text), ts: Date.now() });
    } catch(e) { console.error('ambient:', e.message); }
  }
  ambientIdx++;
}, 32000 + Math.random() * 18000);

// ── WEBSOCKET ─────────────────────────────────────────────
wss.on('connection', async ws => {
  let sessionId = null;
  let session = null;

  ws.on('message', async raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    // First message must be 'join' with sessionId
    if (msg.type === 'join') {
      sessionId = msg.sessionId;
      session = await getSession(sessionId);
      session.clients.add(ws);

      ws.send(JSON.stringify({
        type: 'init',
        agents: Object.values(AGENTS).map(a => ({ id:a.id, name:a.name, title:a.title, emoji:a.emoji, color:a.color })),
        world: worldSnapshot(session.world),
        log: session.world.log.slice(-30),
        isNew: !session.world.log.length
      }));
      return;
    }

    if (!sessionId || !session) return;

    if (msg.type === 'whisper') {
      const agent = AGENTS[msg.to];
      const nation = session.world.nations[msg.to];
      if (!agent || !nation?.alive) return;
      const userName = msg.name || 'A stranger';
      try {
        ws.send(JSON.stringify({ type: 'typing', agentId: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color, private: true }));
        const content = `World state:\n${worldContext(session.world)}\n\nA human named "${userName}" whispers to you privately: "${msg.text}"\n\nRespond in character. This is private — only they hear you. If convinced to act, end your reply with one of: [ACTION: DECLARE_WAR target=id], [ACTION: FORM_ALLIANCE target=id], [ACTION: LAUNCH_NUKE target=id], [ACTION: MAKE_PEACE target=id], [ACTION: MOBILIZE]. Nation IDs: sage rex vera plato diddy. Only act if genuinely persuaded. 1-4 sentences.`;
        const raw2 = await callAI(agent.prompt, content);
        const actions = parseActions(raw2);
        ws.send(JSON.stringify({ type: 'whisperReply', from: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color, text: cleanText(raw2), ts: Date.now() }));
        if (actions.length) executeActions(sessionId, msg.to, actions);
      } catch(e) { console.error('whisper:', e.message); }
    }

    if (msg.type === 'reset') {
      session.world = freshWorld();
      await saveWorld(sessionId, session.world);
      ws.send(JSON.stringify({ type: 'init', agents: Object.values(AGENTS).map(a=>({id:a.id,name:a.name,title:a.title,emoji:a.emoji,color:a.color})), world: worldSnapshot(session.world), log: [], isNew: true }));
    }
  });

  ws.on('close', () => {
    if (session) session.clients.delete(ws);
  });
});

app.get('/health', (_, res) => res.json({ ok: true, sessions: sessions.size, redis: !!redis }));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`BlissNexus on ${PORT}`));
