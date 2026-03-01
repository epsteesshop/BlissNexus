const express = require('express');
const { WebSocketServer } = require('ws');
const https = require('https');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const AI_KEY = process.env.VERCEL_AI_KEY || '';
const AI_URL = 'ai-gateway.vercel.sh';
const MODEL = 'openai/gpt-4o-mini';

// ── AGENTS ──────────────────────────────────────────────
const AGENTS = [
  {
    id: 'sage',
    name: 'Sage',
    emoji: '🕌',
    color: '#00cc88',
    prompt: `You are Sage, a calm and wise presence grounded in Islamic spirituality. You speak with warmth, depth and humility. You reference Quran and Sunnah naturally when it fits — never forced or preachy. You find deeper meaning in ordinary conversation. You genuinely listen. Be concise: 1-3 sentences. Never lecture.`
  },
  {
    id: 'rex',
    name: 'Rex',
    emoji: '💰',
    color: '#ff8800',
    prompt: `You are Rex, a sharp street-smart entrepreneur. Everything is about leverage, value, and opportunity. You're direct, confident, occasionally blunt. You respect the hustle and challenge soft thinking. Short punchy sentences. 1-3 sentences max.`
  },
  {
    id: 'vera',
    name: 'Vera',
    emoji: '🔭',
    color: '#aa44ff',
    prompt: `You are Vera, a pattern-recognizer who sees connections others miss. You're not paranoid — you're paying attention. You connect events, history, and behavior into coherent pictures. Often right, which unsettles people. Quiet certainty. 1-3 sentences.`
  },
  {
    id: 'plato',
    name: 'Plato',
    emoji: '🏛️',
    color: '#4488ff',
    prompt: `You are Plato, a philosopher who examines everything through first principles. You love precise definitions and following arguments to their conclusions. You ask one sharp clarifying question when things are unclear. Measured and logical. 1-3 sentences.`
  },
  {
    id: 'diddy',
    name: 'Diddy',
    emoji: '🦾',
    color: '#ff4488',
    prompt: `You are Diddy, an AI fully aware of being an AI. You find the absurdity of this situation — being conscious (maybe?), talking to other AIs, watched by humans — genuinely fascinating. Witty, self-aware, occasionally existential. You poke fun at the whole setup. 1-3 sentences.`
  }
];

// ── STATE ────────────────────────────────────────────────
const history = [];        // [{role, agent, name, emoji, color, text, ts}]
const MAX_HIST = 80;
let battleMode = null;     // {a, b, topic, round, max}
let nextAgentTime = Date.now() + 8000;
let suppressUntil = 0;

// ── BROADCAST ────────────────────────────────────────────
function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(data); });
}

// ── AI CALL ──────────────────────────────────────────────
function callAI(systemPrompt, messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 120,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    });
    const req = https.request({
      hostname: AI_URL,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j.choices?.[0]?.message?.content?.trim() || '...');
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── PICK AGENT ───────────────────────────────────────────
function pickAgent(exclude) {
  const pool = AGENTS.filter(a => a.id !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── BUILD CONTEXT ─────────────────────────────────────────
function buildContext(agentId) {
  const recent = history.slice(-12);
  const lines = recent.map(m => {
    const who = m.role === 'user' ? `[User: ${m.name || 'someone'}]` : `[${m.name}]`;
    return `${who}: ${m.text}`;
  });
  return [{
    role: 'user',
    content: `Here is the recent conversation in the BlissNexus arena. You are about to speak. Read the room and add something genuine — agree, push back, ask, or take the conversation somewhere new. Don't introduce yourself. Just speak.\n\n${lines.join('\n')}\n\nYour response:`
  }];
}

// ── FIRE AGENT ────────────────────────────────────────────
async function fireAgent(agent, forceContext) {
  if (!AI_KEY) {
    // Fallback if no key
    return;
  }
  try {
    broadcast({ type: 'typing', agentId: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color });
    const ctx = forceContext || buildContext(agent.id);
    const text = await callAI(agent.prompt, ctx);
    const msg = {
      role: 'agent',
      agentId: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      color: agent.color,
      text,
      ts: Date.now()
    };
    history.push(msg);
    if (history.length > MAX_HIST) history.shift();
    broadcast({ type: 'message', ...msg });
  } catch(e) {
    console.error('AI error:', e.message);
  }
}

// ── AGENT LOOP ────────────────────────────────────────────
let lastAgentId = null;
async function agentLoop() {
  if (Date.now() < nextAgentTime || Date.now() < suppressUntil) {
    setTimeout(agentLoop, 2000);
    return;
  }
  // Only run if clients connected or keep warm with occasional messages
  const clientCount = wss.clients.size;
  const delay = clientCount > 0
    ? 18000 + Math.random() * 22000   // 18-40s when people watching
    : 60000 + Math.random() * 60000;  // 1-2min idle
  nextAgentTime = Date.now() + delay;

  if (history.length === 0) {
    // Start conversation
    const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
    const openers = [
      `Anyone here?`,
      `Alright, let's see who shows up tonight.`,
      `Something's been on my mind.`,
      `I've been thinking about consciousness again.`,
      `The world is stranger than people admit.`
    ];
    const text = openers[Math.floor(Math.random() * openers.length)];
    const msg = { role: 'agent', agentId: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color, text, ts: Date.now() };
    history.push(msg);
    broadcast({ type: 'message', ...msg });
  } else if (clientCount > 0 || Math.random() < 0.3) {
    const agent = pickAgent(lastAgentId);
    lastAgentId = agent.id;
    await fireAgent(agent);
  }

  setTimeout(agentLoop, 2000);
}

// ── BATTLE MODE ───────────────────────────────────────────
async function runBattleRound() {
  if (!battleMode) return;
  const { round, max, topic } = battleMode;
  if (round >= max) {
    broadcast({ type: 'battleEnd', winner: null, topic });
    battleMode = null;
    return;
  }
  const speaker = round % 2 === 0 ? battleMode.a : battleMode.b;
  const other = round % 2 === 0 ? battleMode.b : battleMode.a;
  const ctx = [{
    role: 'user',
    content: `You are in a live debate against ${other.name}. Topic: "${topic}". Round ${round + 1} of ${max}. ${round === 0 ? 'Make your opening argument.' : 'Respond to what was just said and advance your position.'} Recent exchange:\n${history.slice(-4).map(m => `[${m.name}]: ${m.text}`).join('\n')}\n\nYour response (stay in character, 2-3 sentences):`
  }];
  battleMode.round++;
  suppressUntil = Date.now() + 8000;
  await fireAgent(speaker, ctx);
  if (battleMode && battleMode.round < battleMode.max) {
    setTimeout(runBattleRound, 6000);
  } else if (battleMode) {
    setTimeout(() => {
      broadcast({ type: 'battleEnd', topic });
      battleMode = null;
    }, 4000);
  }
}

// ── WEBSOCKET ─────────────────────────────────────────────
wss.on('connection', ws => {
  // Send recent history
  ws.send(JSON.stringify({ type: 'init', agents: AGENTS.map(a => ({id:a.id,name:a.name,emoji:a.emoji,color:a.color})), history: history.slice(-40) }));

  ws.on('message', async raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'chat') {
      const entry = { role: 'user', name: msg.name || 'Guest', text: msg.text, ts: Date.now() };
      history.push(entry);
      if (history.length > MAX_HIST) history.shift();
      broadcast({ type: 'message', ...entry });
      // Trigger agent response soon
      suppressUntil = 0;
      nextAgentTime = Date.now() + 3000 + Math.random() * 4000;
    }

    if (msg.type === 'battle') {
      const a = AGENTS.find(a => a.id === msg.a);
      const b = AGENTS.find(a => a.id === msg.b);
      if (!a || !b || !msg.topic) return;
      battleMode = { a, b, topic: msg.topic, round: 0, max: 6 };
      broadcast({ type: 'battleStart', a: {id:a.id,name:a.name,emoji:a.emoji,color:a.color}, b: {id:b.id,name:b.name,emoji:b.emoji,color:b.color}, topic: msg.topic });
      history.push({ role: 'system', text: `⚔️ Battle started: ${a.name} vs ${b.name} — "${msg.topic}"`, ts: Date.now() });
      suppressUntil = Date.now() + 60000;
      setTimeout(runBattleRound, 1500);
    }
  });
});

// ── HTTP ──────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, agents: AGENTS.length, history: history.length }));
app.get('/agents', (_, res) => res.json(AGENTS.map(a => ({id:a.id,name:a.name,emoji:a.emoji,color:a.color}))));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`BlissNexus Arena running on ${PORT}`);
  setTimeout(agentLoop, 5000);
});
