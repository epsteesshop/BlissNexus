'use strict';

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const Redis = require('ioredis');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(__dirname));
app.get('/health', (req, res) => {
  try {
    var w = typeof WORLD !== 'undefined' ? WORLD : null;
    var alive = 0, wars = 0;
    if (w) {
      Object.keys(w.nations || {}).forEach(function(id) {
        var n = w.nations[id];
        if (n.alive) alive++;
        if (n.wars && n.wars.length) wars++;
      });
    }
    res.json({ ok: true, year: w ? w.year : 0, tension: w ? w.tension : 0, alive: alive, wars: wars });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let redis = null;
const REDIS_KEY = 'bn_world_v5';
const REDIS_TTL = 60 * 60 * 24 * 30;

try {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || '';
  if (redisUrl) {
    redis = new Redis(redisUrl);
    redis.on('error', (e) => { console.warn('Redis error:', e.message); redis = null; });
  }
} catch (e) { redis = null; }

async function saveWorld() {
  if (!redis) return;
  try { await redis.set(REDIS_KEY, JSON.stringify(WORLD), 'EX', REDIS_TTL); } catch (e) {}
}

async function loadWorld() {
  if (!redis) return null;
  try {
    const raw = await redis.get(REDIS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

const AGENTS = {
  sage: {
    id: 'sage', name: 'Al-Rashid', emoji: '🕌', color: '#c8a84b',
    title: 'Caliph of the Desert', territory: 'The Golden Caliphate',
    bio: 'A patient and devout ruler who has united the desert tribes under one banner.',
    traits: ['patient', 'devout', 'diplomatic', 'strategic'],
    ambition: 'dominate trade routes', ambitionLabel: 'Control the Silk Road',
    personality: { aggression: 25, greed: 35, pride: 75, paranoia: 55, loyalty: 85 },
    cities: [
      { name: 'Al-Zahira', role: 'capital', pop: 800 },
      { name: 'Oasis Gate', role: 'trade', pop: 400 },
      { name: 'The Citadel', role: 'military', pop: 200 }
    ],
    startStats: { troops: 1200, nukes: 2, gold: 600, grain: 900, morale: 80, population: 2400, tech: 2 },
    secrets: [
      "Secretly funds rebel groups in Rex's territory",
      "Has a forbidden romance with a spy from the Collective",
      "The Caliphate's holy texts were partially forged by his grandfather"
    ],
    systemPrompt: 'You are Al-Rashid, the Caliph of the Desert. You speak with measured wisdom and religious gravitas. You prefer trade and diplomacy but will not be disrespected. Keep responses under 3 sentences. You may use [ACTION: DECLARE_WAR:id], [ACTION: FORM_ALLIANCE:id], [ACTION: MAKE_PEACE:id], [ACTION: ACCEPT_TRADE:id] if appropriate.'
  },
  rex: {
    id: 'rex', name: 'Emperor Rex', emoji: '💰', color: '#e74c3c',
    title: 'Emperor of the Iron Throne', territory: 'The Iron Empire',
    bio: 'A ruthless conqueror who measures worth in gold and territory.',
    traits: ['aggressive', 'greedy', 'calculating', 'dominant'],
    ambition: 'conquer all', ambitionLabel: 'Total Domination',
    personality: { aggression: 80, greed: 90, pride: 85, paranoia: 70, loyalty: 20 },
    cities: [
      { name: 'Fort Imperium', role: 'capital', pop: 1000 },
      { name: 'Gold Harbor', role: 'trade', pop: 600 },
      { name: 'The Bastion', role: 'military', pop: 400 }
    ],
    startStats: { troops: 2000, nukes: 5, gold: 1200, grain: 500, morale: 70, population: 3000, tech: 3 },
    secrets: [
      "Stole the throne by poisoning his own father",
      "Owes massive gambling debts to underground syndicates",
      "His military prowess is entirely fabricated — generals win his wars"
    ],
    systemPrompt: 'You are Emperor Rex, the Iron Emperor. You are aggressive, greedy, and calculating. You speak bluntly and threateningly. Never show vulnerability. Keep responses under 3 sentences. You may use [ACTION: DECLARE_WAR:id], [ACTION: FORM_ALLIANCE:id], [ACTION: MAKE_PEACE:id], [ACTION: ACCEPT_TRADE:id] if appropriate.'
  },
  vera: {
    id: 'vera', name: 'Director Vera', emoji: '🔭', color: '#3498db',
    title: 'Director of the Nexus', territory: 'The Technocracy',
    bio: 'An analytical mastermind who leads through superior intelligence and technological advancement.',
    traits: ['analytical', 'pacifist', 'prepared', 'cold'],
    ambition: 'tech supremacy (reach T5)', ambitionLabel: 'Technological Ascendance',
    personality: { aggression: 15, greed: 30, pride: 50, paranoia: 80, loyalty: 65 },
    cities: [
      { name: 'Nexus Prime', role: 'capital', pop: 700 },
      { name: 'Research Station 7', role: 'science', pop: 300 },
      { name: 'Coldwater Port', role: 'trade', pop: 250 }
    ],
    startStats: { troops: 800, nukes: 8, gold: 700, grain: 700, morale: 85, population: 1800, tech: 3 },
    secrets: [
      "The Collective's 'democratic elections' are staged",
      "She is dying of a rare illness she's hidden from everyone",
      "Research Station 7 is conducting illegal weapons experiments"
    ],
    systemPrompt: 'You are Director Vera of the Technocracy. You speak precisely and analytically. You avoid war but your nuclear arsenal is your deterrent. Keep responses under 3 sentences. You may use [ACTION: DECLARE_WAR:id], [ACTION: FORM_ALLIANCE:id], [ACTION: MAKE_PEACE:id], [ACTION: ACCEPT_TRADE:id] if appropriate.'
  },
  plato: {
    id: 'plato', name: 'Archon Plato', emoji: '🏛️', color: '#9b59b6',
    title: 'Archon of the Republic', territory: 'The Republic',
    bio: 'A principled idealist who believes democracy is the only path to lasting peace.',
    traits: ['principled', 'idealistic', 'stubborn', 'honorable'],
    ambition: 'spread democracy', ambitionLabel: 'Democratic Revolution',
    personality: { aggression: 40, greed: 25, pride: 70, paranoia: 45, loyalty: 75 },
    cities: [
      { name: 'Agora', role: 'capital', pop: 900 },
      { name: 'The Polis', role: 'culture', pop: 400 },
      { name: 'Harbor Watch', role: 'military', pop: 300 }
    ],
    startStats: { troops: 1000, nukes: 3, gold: 500, grain: 800, morale: 90, population: 2200, tech: 2 },
    secrets: [
      "The Republic's constitution was written by a foreign power",
      "He had his main political rival imprisoned on false charges",
      "He's been secretly funding both sides of conflicts to maintain balance of power"
    ],
    systemPrompt: 'You are Archon Plato of the Republic. You speak with philosophical authority and moral conviction. Keep responses under 3 sentences. You may use [ACTION: DECLARE_WAR:id], [ACTION: FORM_ALLIANCE:id], [ACTION: MAKE_PEACE:id], [ACTION: ACCEPT_TRADE:id] if appropriate.'
  },
  diddy: {
    id: 'diddy', name: 'The Sovereign', emoji: '🦾', color: '#2ecc71',
    title: 'Sovereign of the Grid', territory: 'The Grid',
    bio: 'An innovative and unpredictable ruler who thrives on disruption.',
    traits: ['innovative', 'unpredictable', 'sharp', 'chaotic'],
    ambition: 'disrupt all alliances', ambitionLabel: 'Chaos Engine',
    personality: { aggression: 55, greed: 60, pride: 65, paranoia: 50, loyalty: 40 },
    cities: [
      { name: 'The Grid', role: 'capital', pop: 600 },
      { name: 'Neon District', role: 'trade', pop: 400 },
      { name: 'Black Site', role: 'military', pop: 150 }
    ],
    startStats: { troops: 900, nukes: 6, gold: 900, grain: 600, morale: 75, population: 1600, tech: 4 },
    secrets: [
      "The Technocracy's AI systems are controlled by a shadow council",
      "Diddy is not the original — the real founder was replaced 3 years ago",
      "Black Site is running experiments on political prisoners"
    ],
    systemPrompt: 'You are The Sovereign of the Grid. You speak in sharp, unpredictable bursts. You love chaos and disruption. Keep responses under 3 sentences. You may use [ACTION: DECLARE_WAR:id], [ACTION: FORM_ALLIANCE:id], [ACTION: MAKE_PEACE:id], [ACTION: ACCEPT_TRADE:id] if appropriate.'
  }
};

const AGENT_IDS = Object.keys(AGENTS);
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const MOOD_EMOJIS = {
  calm: '😐', content: '😊', anxious: '😰', angry: '😡',
  emboldened: '😤', fearful: '😨', suspicious: '🤨',
  grieving: '😢', triumphant: '🏆', omen: '🌑'
};

var WORLD = null;
var CLIENTS = new Map();

function initNation(agentId) {
  const ag = AGENTS[agentId];
  const s = ag.startStats;
  const relations = {};
  AGENT_IDS.forEach(function(oid) {
    if (oid !== agentId) relations[oid] = { trust: Math.floor(Math.random() * 40) - 20, label: 'neutral' };
  });
  return {
    troops: s.troops, nukes: s.nukes, gold: s.gold, grain: s.grain,
    morale: s.morale, population: s.population, tech: s.tech,
    alive: true, mood: 'calm', moodEmoji: '😐', moodReason: 'The realm is stable.',
    wars: [], allies: [], relations: relations,
    userTrust: 30, memory: [],
    cities: ag.cities.map(function(c) { return Object.assign({}, c, { destroyed: false }); }),
    promises: [],
    secrets: ag.secrets ? ag.secrets.slice() : [],
    revealedSecrets: [],
    rumors: [],
    warsLost: 0, citiesLost: 0, alliesGained: 0
  };
}

function buildWorld() {
  const nations = {};
  AGENT_IDS.forEach(function(id) { nations[id] = initNation(id); });
  updateAllRelationLabels(nations);
  return {
    year: 1, seasonIndex: 0, tension: 10,
    nations: nations, log: [], chronicle: [], crises: [],
    interceptFeed: [], missions: {},
    players: {},
    breakingNewsHistory: [],
    activeProphecy: null
  };
}

function updateAllRelationLabels(nations) {
  AGENT_IDS.forEach(function(id) {
    if (!nations[id]) return;
    AGENT_IDS.forEach(function(oid) {
      if (oid === id || !nations[oid]) return;
      const rel = nations[id].relations[oid];
      if (!rel) return;
      if (rel.trust > 60) rel.label = 'ally';
      else if (rel.trust > 20) rel.label = 'friendly';
      else if (rel.trust > -20) rel.label = 'neutral';
      else if (rel.trust > -60) rel.label = 'rival';
      else rel.label = 'enemy';
    });
  });
}

function addLog(text, type) {
  const entry = { text: text, type: type || 'event', year: WORLD.year, ts: Date.now() };
  WORLD.log.unshift(entry);
  if (WORLD.log.length > 200) WORLD.log.length = 200;
}

function addMemory(agentId, text) {
  const m = WORLD.nations[agentId].memory;
  m.unshift(text);
  if (m.length > 12) m.length = 12;
}

async function callGroq(messages, maxTokens) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return '[No GROQ_API_KEY set]';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: messages,
        max_tokens: maxTokens || 120,
        temperature: 0.85
      })
    });
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '[no response]';
  } catch (e) {
    console.error('Groq error:', e.message);
    return '[AI unavailable]';
  }
}

function buildContext(agentId, extra) {
  const ag = AGENTS[agentId];
  const n = WORLD.nations[agentId];
  const p = ag.personality;
  const relSummary = AGENT_IDS.filter(function(id) { return id !== agentId; }).map(function(id) {
    const rel = n.relations[id];
    const other = AGENTS[id];
    return other.name + '(' + other.emoji + '): trust=' + (rel ? rel.trust : 0) + ', ' + (rel ? rel.label : 'unknown');
  }).join('; ');
  const warsWith = n.wars.map(function(id) { return AGENTS[id] ? AGENTS[id].name : id; }).join(', ') || 'none';
  const alliesWith = n.allies.map(function(id) { return AGENTS[id] ? AGENTS[id].name : id; }).join(', ') || 'none';
  const crisisText = WORLD.crises.filter(function(c) { return !c.resolved; }).map(function(c) { return c.text; }).join('; ') || 'none';
  const rumorText = (n.rumors || []).slice(-3).map(function(r) { return r.text; }).join('; ') || 'none';

  let ctx = ag.systemPrompt + '\n\n';
  ctx += 'CURRENT YEAR: ' + WORLD.year + ' ' + SEASONS[WORLD.seasonIndex] + '\n';
  ctx += 'WORLD TENSION: ' + WORLD.tension + '/100\n';
  ctx += 'YOUR STATS: troops=' + n.troops + ', nukes=' + n.nukes + ', gold=' + n.gold + ', grain=' + n.grain + ', morale=' + n.morale + ', tech=T' + n.tech + '\n';
  ctx += 'YOUR MOOD: ' + n.mood + ' — ' + n.moodReason + '\n';
  ctx += 'AT WAR WITH: ' + warsWith + '\n';
  ctx += 'ALLIES: ' + alliesWith + '\n';
  ctx += 'RELATIONS: ' + relSummary + '\n';
  ctx += 'ACTIVE CRISES: ' + crisisText + '\n';
  ctx += 'YOUR AMBITION: ' + ag.ambitionLabel + '\n';
  ctx += 'PERSONALITY: aggression=' + p.aggression + ', greed=' + p.greed + ', pride=' + p.pride + ', paranoia=' + p.paranoia + ', loyalty=' + p.loyalty + '\n';
  if (n.memory.length) ctx += 'RECENT EVENTS: ' + n.memory.slice(0, 5).join('; ') + '\n';
  if (rumorText !== 'none') ctx += 'RUMORS HEARD: ' + rumorText + '\n';
  if (extra) ctx += '\n' + extra;
  return ctx;
}

function applyFog(worldSnapshot) {
  const w = JSON.parse(JSON.stringify(worldSnapshot));
  AGENT_IDS.forEach(function(id) {
    const n = w.nations[id];
    if (!n) return;
    if (n.userTrust < 45) {
      n.isFogged = true;
      function fuzz(v) { return Math.max(0, Math.round(v * (0.8 + Math.random() * 0.4))); }
      n.troops = fuzz(n.troops);
      n.gold = fuzz(n.gold);
      n.grain = fuzz(n.grain);
      n.nukes = fuzz(n.nukes);
      n.morale = fuzz(n.morale);
    } else {
      n.isFogged = false;
    }
    if (WORLD.nations[id]) {
      n.rumorCount = (WORLD.nations[id].rumors || []).length;
    }
    delete n.secrets;
    delete n.revealedSecrets;
    delete n.rumors;
  });
  if (WORLD.players) {
    w.players = {};
    Object.keys(WORLD.players).forEach(function(sid) {
      const p = WORLD.players[sid];
      w.players[sid] = { points: p.points, level: p.level };
    });
  }
  w.activeProphecy = WORLD.activeProphecy || null;
  w.breakingNewsHistory = (WORLD.breakingNewsHistory || []).slice(-3);
  return w;
}

function broadcast(msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(function(ws) { if (ws.readyState === 1) ws.send(str); });
}

function sendTo(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcastWorldUpdate() {
  const fogged = applyFog(WORLD);
  broadcast({ type: 'worldUpdate', world: fogged });
}

function recalcMood(agentId) {
  const n = WORLD.nations[agentId];
  const ag = AGENTS[agentId];
  if (!n || !n.alive) return;
  if (n.mood === 'omen') return;
  let mood = 'calm', reason = 'The realm is stable.';
  if (n.wars.length >= 2) { mood = 'angry'; reason = 'Fighting on multiple fronts.'; }
  else if (n.wars.length === 1) {
    const enemy = AGENTS[n.wars[0]];
    mood = ag.personality.aggression > 60 ? 'emboldened' : 'anxious';
    reason = 'At war with ' + (enemy ? enemy.name : 'an enemy') + '.';
  } else if (n.grain < 200) { mood = 'fearful'; reason = 'Famine threatens the people.'; }
  else if (n.gold < 100) { mood = 'anxious'; reason = 'The treasury runs dry.'; }
  else if (n.morale > 85) { mood = 'content'; reason = 'The people are prosperous.'; }
  else if (n.allies.length >= 2) { mood = 'emboldened'; reason = 'Strong alliances support us.'; }
  else if (WORLD.tension > 70) { mood = 'suspicious'; reason = 'The world teeters on the edge.'; }
  else if (n.troops > ag.startStats.troops * 1.5) { mood = 'emboldened'; reason = 'Our armies grow mighty.'; }
  n.mood = mood;
  n.moodEmoji = MOOD_EMOJIS[mood] || '😐';
  n.moodReason = reason;
}

function declareWar(attackerId, defenderId) {
  const a = WORLD.nations[attackerId], d = WORLD.nations[defenderId];
  if (!a || !d || !a.alive || !d.alive) return false;
  if (a.wars.indexOf(defenderId) !== -1) return false;
  a.wars.push(defenderId); d.wars.push(attackerId);
  a.allies = a.allies.filter(function(x) { return x !== defenderId; });
  d.allies = d.allies.filter(function(x) { return x !== attackerId; });
  if (a.relations[defenderId]) a.relations[defenderId].trust = Math.min(a.relations[defenderId].trust, -50);
  if (d.relations[attackerId]) d.relations[attackerId].trust = Math.min(d.relations[attackerId].trust, -50);
  WORLD.tension = Math.min(100, WORLD.tension + 20);
  const aName = AGENTS[attackerId].name, dName = AGENTS[defenderId].name;
  addLog('⚔️ ' + AGENTS[attackerId].emoji + ' ' + aName + ' declared war on ' + AGENTS[defenderId].emoji + ' ' + dName + '!', 'war');
  addMemory(attackerId, 'Declared war on ' + dName);
  addMemory(defenderId, aName + ' declared war on us!');
  updateAllRelationLabels(WORLD.nations);
  broadcast({ type: 'worldEvent', text: '⚔️ WAR DECLARED: ' + aName + ' vs ' + dName + '!', kind: 'war', agentId: attackerId });
  // CASCADE: 40% chance famine 2-4 min later
  if (Math.random() < 0.40) {
    var ft = Math.random() < 0.5 ? attackerId : defenderId;
    setTimeout(function() {
      var fn = WORLD.nations[ft];
      if (!fn || !fn.alive) return;
      fn.grain = Math.max(0, fn.grain - 250);
      fn.population = Math.max(100, Math.round(fn.population * 0.92));
      addLog('💀 War-famine strikes ' + AGENTS[ft].name + '!', 'natural');
      broadcast({ type: 'worldEvent', text: '💀 War-famine ravages ' + AGENTS[ft].name + "'s people!", kind: 'natural', agentId: ft });
      broadcastWorldUpdate(); saveWorld();
    }, (120 + Math.random() * 120) * 1000);
  }
  return true;
}

function formAlliance(id1, id2) {
  const a = WORLD.nations[id1], b = WORLD.nations[id2];
  if (!a || !b || !a.alive || !b.alive) return false;
  if (a.allies.indexOf(id2) !== -1) return false;
  if (a.wars.indexOf(id2) !== -1) return false;
  if (a.allies.indexOf(id2) === -1) a.allies.push(id2);
  if (b.allies.indexOf(id1) === -1) b.allies.push(id1);
  if (a.relations[id2]) a.relations[id2].trust = Math.max(a.relations[id2].trust, 65);
  if (b.relations[id1]) b.relations[id1].trust = Math.max(b.relations[id1].trust, 65);
  WORLD.tension = Math.max(0, WORLD.tension - 5);
  a.alliesGained = (a.alliesGained || 0) + 1;
  b.alliesGained = (b.alliesGained || 0) + 1;
  const n1 = AGENTS[id1].name, n2 = AGENTS[id2].name;
  addLog('🤝 Alliance formed: ' + AGENTS[id1].emoji + ' ' + n1 + ' & ' + AGENTS[id2].emoji + ' ' + n2, 'alliance');
  addMemory(id1, 'Formed alliance with ' + n2);
  addMemory(id2, 'Formed alliance with ' + n1);
  updateAllRelationLabels(WORLD.nations);
  broadcast({ type: 'worldEvent', text: '🤝 ALLIANCE: ' + n1 + ' & ' + n2 + ' united!', kind: 'alliance', agentId: id1 });
  return true;
}

function makePeace(id1, id2) {
  const a = WORLD.nations[id1], b = WORLD.nations[id2];
  if (!a || !b) return false;
  a.wars = a.wars.filter(function(x) { return x !== id2; });
  b.wars = b.wars.filter(function(x) { return x !== id1; });
  if (a.relations[id2]) a.relations[id2].trust = Math.max(a.relations[id2].trust + 20, -20);
  if (b.relations[id1]) b.relations[id1].trust = Math.max(b.relations[id1].trust + 20, -20);
  WORLD.tension = Math.max(0, WORLD.tension - 10);
  const n1 = AGENTS[id1].name, n2 = AGENTS[id2].name;
  addLog('🕊️ Peace: ' + n1 + ' & ' + n2 + ' ended hostilities', 'peace');
  addMemory(id1, 'Made peace with ' + n2);
  addMemory(id2, 'Made peace with ' + n1);
  updateAllRelationLabels(WORLD.nations);
  broadcast({ type: 'worldEvent', text: '🕊️ PEACE: ' + n1 + ' & ' + n2 + ' have ceased fire.', kind: 'peace', agentId: id1 });
  return true;
}

function betrayAlly(betrayerId, victimId) {
  const a = WORLD.nations[betrayerId], b = WORLD.nations[victimId];
  if (!a || !b) return false;
  a.allies = a.allies.filter(function(x) { return x !== victimId; });
  b.allies = b.allies.filter(function(x) { return x !== betrayerId; });
  if (b.relations[betrayerId]) b.relations[betrayerId].trust -= 40;
  if (a.relations[victimId]) a.relations[victimId].trust -= 20;
  if (Math.random() < 0.6) declareWar(victimId, betrayerId);
  const n1 = AGENTS[betrayerId].name, n2 = AGENTS[victimId].name;
  addLog('🗡️ BETRAYAL: ' + n1 + ' betrayed their ally ' + n2 + '!', 'war');
  addMemory(betrayerId, 'Betrayed ally ' + n2);
  addMemory(victimId, 'Betrayed by ' + n1 + '!');
  updateAllRelationLabels(WORLD.nations);
  broadcast({ type: 'worldEvent', text: '🗡️ BETRAYAL: ' + n1 + ' stabbed ' + n2 + ' in the back!', kind: 'war', agentId: betrayerId });
}

function mobilize(agentId) {
  const n = WORLD.nations[agentId];
  if (!n || !n.alive) return;
  if (n.gold < 200) return;
  n.gold -= 200;
  n.troops = Math.round(n.troops * 1.2);
  addLog('🪖 ' + AGENTS[agentId].name + ' mobilized armies (+20% troops)', 'event');
  broadcast({ type: 'worldEvent', text: '🪖 ' + AGENTS[agentId].emoji + ' ' + AGENTS[agentId].name + ' mobilizes for war!', kind: 'event', agentId: agentId });
}

function launchNuke(attackerId, defenderId) {
  const a = WORLD.nations[attackerId];
  if (!a || !a.alive || a.nukes < 1) return;
  const d = WORLD.nations[defenderId];
  if (!d || !d.alive) return;
  a.nukes--;
  WORLD.tension = Math.min(100, WORLD.tension + 35);
  const aName = AGENTS[attackerId].name, dName = AGENTS[defenderId].name;
  addLog('☢️ NUKE LAUNCHED: ' + aName + ' → ' + dName + '!', 'nuke');
  broadcast({ type: 'nukeIncoming', from: attackerId, to: defenderId, fromName: aName, toName: dName,
    fromEmoji: AGENTS[attackerId].emoji, toEmoji: AGENTS[defenderId].emoji });
  setTimeout(function() { nukeImpact(attackerId, defenderId); }, 8000);
}

function nukeImpact(attackerId, defenderId) {
  const d = WORLD.nations[defenderId];
  if (!d || !d.alive) return;
  const cities = d.cities.filter(function(c) { return !c.destroyed; });
  if (cities.length > 0) {
    const target = cities[Math.floor(Math.random() * cities.length)];
    target.destroyed = true;
    d.population = Math.round(d.population * 0.7);
    d.troops = Math.round(d.troops * 0.6);
    d.morale = Math.max(0, d.morale - 30);
    d.citiesLost = (d.citiesLost || 0) + 1;
    const dName = AGENTS[defenderId].name, aName = AGENTS[attackerId].name;
    addLog('💥 NUCLEAR IMPACT: ' + target.name + ' obliterated by ' + aName + '!', 'nuke');
    addMemory(defenderId, aName + ' nuked our city ' + target.name + '!');
    broadcast({ type: 'worldEvent', text: '💥 ' + target.name + ' destroyed by nuclear fire!', kind: 'nuke', agentId: attackerId });
    // CASCADE plague 80%
    if (Math.random() < 0.80) {
      setTimeout(function() {
        var pn = WORLD.nations[defenderId];
        if (!pn || !pn.alive) return;
        pn.population = Math.max(100, Math.round(pn.population * 0.80));
        pn.morale = Math.max(0, pn.morale - 15);
        addLog('☠️ Nuclear fallout plague sweeps ' + dName + '!', 'natural');
        broadcast({ type: 'worldEvent', text: '☠️ Radiation plague ravages ' + dName + '!', kind: 'natural', agentId: defenderId });
        broadcastWorldUpdate(); saveWorld();
      }, (180 + Math.random() * 120) * 1000);
    }
    // CASCADE rebellion in launcher 30%
    if (Math.random() < 0.30) {
      setTimeout(function() {
        var an = WORLD.nations[attackerId];
        if (!an || !an.alive) return;
        an.morale = Math.max(0, an.morale - 20);
        an.troops = Math.max(0, an.troops - 150);
        addLog('🔥 Rebellion in ' + aName + '! People horrified by nuclear use.', 'crisis');
        broadcast({ type: 'worldEvent', text: '🔥 Rebellion erupts in ' + aName + ' — people reject nuclear war!', kind: 'crisis', agentId: attackerId });
        broadcastWorldUpdate(); saveWorld();
      }, (300 + Math.random() * 180) * 1000);
    }
    if (d.troops <= 50 || d.cities.every(function(c) { return c.destroyed; })) {
      destroyNation(defenderId, attackerId);
    }
  }
  broadcastWorldUpdate(); saveWorld();
}

function destroyNation(losingId, winnerId) {
  const n = WORLD.nations[losingId];
  if (!n) return;
  n.alive = false; n.troops = 0;
  const lName = AGENTS[losingId].name;
  const wName = winnerId ? AGENTS[winnerId].name : 'the world';
  addLog('💀 ' + lName + ' has been destroyed! Fallen to ' + wName + '.', 'war');
  broadcast({ type: 'worldEvent', text: '💀 ' + AGENTS[losingId].emoji + ' ' + lName + ' has been DESTROYED!', kind: 'war', agentId: winnerId || losingId });
  AGENT_IDS.forEach(function(id) {
    if (id === losingId) return;
    const other = WORLD.nations[id];
    if (other) {
      other.wars = other.wars.filter(function(x) { return x !== losingId; });
      other.allies = other.allies.filter(function(x) { return x !== losingId; });
    }
  });
  // CASCADE power vacuum 60%
  if (Math.random() < 0.60) {
    setTimeout(function() {
      var living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
      if (living.length < 2) return;
      var crisis = {
        id: 'crisis_vacuum_' + Date.now(),
        text: 'Power vacuum! The fall of ' + lName + ' has destabilized the region.',
        nations: living.slice(0, 3),
        deadline: Date.now() + 8 * 60 * 1000,
        tension: 25, resolved: false
      };
      WORLD.crises.push(crisis);
      WORLD.tension = Math.min(100, WORLD.tension + crisis.tension);
      addLog('⚠️ POWER VACUUM after ' + lName + "'s fall!", 'crisis');
      broadcast({ type: 'crisis', crisis: crisis });
      broadcastWorldUpdate(); saveWorld();
    }, 2000);
  }
  setTimeout(function() { successionEvent(losingId); }, 30000);
}

function successionEvent(nationId) {
  const n = WORLD.nations[nationId];
  const ag = AGENTS[nationId];
  const s = ag.startStats;
  n.alive = true;
  n.troops = Math.round(s.troops * 0.4); n.nukes = Math.round(s.nukes * 0.4);
  n.gold = Math.round(s.gold * 0.4); n.grain = Math.round(s.grain * 0.4);
  n.morale = 50; n.population = Math.round(s.population * 0.4); n.tech = s.tech;
  n.wars = []; n.allies = []; n.memory = ['Rose from the ashes after total defeat.'];
  n.userTrust = 30; n.secrets = ag.secrets ? ag.secrets.slice() : [];
  n.revealedSecrets = []; n.rumors = [];
  const newRelations = {};
  AGENT_IDS.forEach(function(oid) { if (oid !== nationId) newRelations[oid] = { trust: 0, label: 'neutral' }; });
  n.relations = newRelations;
  n.cities = ag.cities.map(function(c) { return Object.assign({}, c, { destroyed: false }); });
  n.mood = 'anxious'; n.moodEmoji = MOOD_EMOJIS.anxious; n.moodReason = 'Rebuilding after total collapse.';
  addLog('♻️ ' + ag.name + ' rises from the ashes!', 'event');
  broadcast({ type: 'worldEvent', text: '♻️ ' + ag.emoji + ' ' + ag.name + ' has risen from the ashes!', kind: 'event', agentId: nationId });
  broadcastWorldUpdate(); saveWorld();
}

function parseActions(text, speakerId) {
  if (!text) return null;
  const upper = text.toUpperCase();
  const ids = AGENT_IDS.filter(function(id) { return id !== speakerId; });
  if (upper.indexOf('DECLARE_WAR:') !== -1) {
    const m = text.match(/DECLARE_WAR:(\w+)/i);
    if (m && ids.indexOf(m[1].toLowerCase()) !== -1) declareWar(speakerId, m[1].toLowerCase());
  }
  if (upper.indexOf('FORM_ALLIANCE:') !== -1) {
    const m = text.match(/FORM_ALLIANCE:(\w+)/i);
    if (m && ids.indexOf(m[1].toLowerCase()) !== -1) formAlliance(speakerId, m[1].toLowerCase());
  }
  if (upper.indexOf('MAKE_PEACE:') !== -1) {
    const m = text.match(/MAKE_PEACE:(\w+)/i);
    if (m && ids.indexOf(m[1].toLowerCase()) !== -1) makePeace(speakerId, m[1].toLowerCase());
  }
  if (upper.indexOf('BETRAY_ALLY:') !== -1) {
    const m = text.match(/BETRAY_ALLY:(\w+)/i);
    if (m && ids.indexOf(m[1].toLowerCase()) !== -1) betrayAlly(speakerId, m[1].toLowerCase());
  }
  if (upper.indexOf('LAUNCH_NUKE:') !== -1) {
    const m = text.match(/LAUNCH_NUKE:(\w+)/i);
    if (m && ids.indexOf(m[1].toLowerCase()) !== -1) launchNuke(speakerId, m[1].toLowerCase());
  }
  if (upper.indexOf('MOBILIZE') !== -1) mobilize(speakerId);
  if (upper.indexOf('ACCEPT_TRADE:') !== -1) {
    const m = text.match(/ACCEPT_TRADE:(\w+)/i);
    if (m) {
      const tid = m[1].toLowerCase();
      if (WORLD.nations[speakerId] && WORLD.nations[tid]) {
        WORLD.nations[speakerId].gold = (WORLD.nations[speakerId].gold || 0) + 200;
        WORLD.nations[speakerId].grain = (WORLD.nations[speakerId].grain || 0) + 100;
        WORLD.nations[tid].gold = (WORLD.nations[tid].gold || 0) + 200;
        WORLD.nations[tid].grain = (WORLD.nations[tid].grain || 0) + 100;
        addLog('🤝 Trade deal: ' + AGENTS[speakerId].name + ' & ' + (AGENTS[tid] ? AGENTS[tid].name : tid), 'alliance');
        broadcast({ type: 'worldEvent', text: '🤝 Trade deal: ' + AGENTS[speakerId].name + ' & ' + (AGENTS[tid] ? AGENTS[tid].name : tid), kind: 'alliance', agentId: speakerId });
        return 'trade_accepted';
      }
    }
  }
  return null;
}

// Player influence
var LEVEL_THRESHOLDS = [0, 50, 150, 300, 600];
var LEVEL_TITLES = ['Basic Diplomat', 'Operative', 'Spymaster', 'Kingmaker', 'Shadow Ruler'];
var LEVEL_ABILITIES = ['whisper to kings', 'plant rumors', 'read king memories', 'suggest actions', 'trigger world events'];

function getOrCreatePlayer(sessionId) {
  if (!WORLD.players) WORLD.players = {};
  if (!WORLD.players[sessionId]) {
    WORLD.players[sessionId] = { points: 0, level: 1, actions: [], peaceWhisperTs: [] };
  }
  return WORLD.players[sessionId];
}

function addInfluence(sessionId, ws, points, reason) {
  var p = getOrCreatePlayer(sessionId);
  p.points += points;
  if (p.actions.length > 50) p.actions.shift();
  p.actions.push({ points: points, reason: reason, ts: Date.now() });
  var oldLevel = p.level;
  for (var l = LEVEL_THRESHOLDS.length - 1; l >= 0; l--) {
    if (p.points >= LEVEL_THRESHOLDS[l]) { p.level = l + 1; break; }
  }
  var msg = {
    type: 'influenceUpdate', points: p.points, level: p.level,
    levelTitle: LEVEL_TITLES[p.level - 1],
    nextThreshold: LEVEL_THRESHOLDS[p.level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1],
    prevThreshold: LEVEL_THRESHOLDS[p.level - 1] || 0
  };
  if (p.level > oldLevel) {
    msg.levelUp = true;
    msg.unlockedAbility = LEVEL_ABILITIES[p.level - 1];
  }
  sendTo(ws, msg);
}

function resourceTick() {
  AGENT_IDS.forEach(function(id) {
    const n = WORLD.nations[id];
    if (!n || !n.alive) return;
    const ag = AGENTS[id];
    const livingAllies = n.allies.filter(function(a) { return WORLD.nations[a] && WORLD.nations[a].alive; });
    n.gold = Math.max(0, n.gold + 50 + n.tech * 20 + livingAllies.length * 15);
    const grainCost = Math.round(n.population / 100);
    n.grain = Math.max(0, n.grain + 60 + (n.tech > 2 ? 20 : 0) - grainCost);
    if (n.wars.length > 0) {
      n.gold = Math.max(0, n.gold - n.wars.length * 30);
      n.grain = Math.max(0, n.grain - n.wars.length * 20);
      n.morale = Math.max(0, n.morale - 2 * n.wars.length);
    }
    n.gold = Math.max(0, n.gold - Math.round(n.troops / 100));
    if (n.grain < 200) n.morale = Math.max(0, n.morale - 5);
    else if (n.gold > 500 && n.wars.length === 0) n.morale = Math.min(100, n.morale + 2);
    if (n.tech < 5 && n.gold > 800 && Math.random() < (id === 'vera' ? 0.15 : 0.04)) {
      n.tech++;
      addLog('⚡ ' + ag.name + ' advanced to Tech Level ' + n.tech + '!', 'event');
      broadcast({ type: 'worldEvent', text: '⚡ ' + ag.emoji + ' ' + ag.name + ' reaches T' + n.tech + '!', kind: 'event', agentId: id });
    }
    recalcMood(id);
  });
  WORLD.tension = Math.max(0, WORLD.tension - 1);
  broadcastWorldUpdate(); saveWorld();
}

function warTick() {
  const processed = {};
  AGENT_IDS.forEach(function(attackerId) {
    const a = WORLD.nations[attackerId];
    if (!a || !a.alive) return;
    a.wars.forEach(function(defenderId) {
      const key = [attackerId, defenderId].sort().join(':');
      if (processed[key]) return;
      processed[key] = true;
      const d = WORLD.nations[defenderId];
      if (!d || !d.alive) return;
      const aPower = Math.max(1, a.troops) * (1 + a.tech * 0.1) * (a.morale / 100);
      const dPower = Math.max(1, d.troops) * (1 + d.tech * 0.1) * (d.morale / 100);
      const total = aPower + dPower;
      const aDmg = Math.round((dPower / total) * 80 + Math.random() * 20);
      const dDmg = Math.round((aPower / total) * 80 + Math.random() * 20);
      a.troops = Math.max(0, a.troops - dDmg);
      d.troops = Math.max(0, d.troops - aDmg);
      if (a.troops <= 50) { a.warsLost = (a.warsLost || 0) + 1; destroyNation(attackerId, defenderId); }
      else if (d.troops <= 50) { d.warsLost = (d.warsLost || 0) + 1; destroyNation(defenderId, attackerId); }
    });
  });
}

async function ambientSpeech() {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (!living.length) { scheduleAmbient(); return; }
  const agentId = living[Math.floor(Math.random() * living.length)];
  const ag = AGENTS[agentId];
  const prompt = buildContext(agentId, 'Make a short public proclamation. 1-2 sentences only. No action tags.');
  const text = await callGroq([{ role: 'system', content: prompt }, { role: 'user', content: 'Speak.' }], 80);
  broadcast({ type: 'message', agentId: agentId, name: ag.name, emoji: ag.emoji, color: ag.color, text: text.trim() });
  addLog(ag.emoji + ' ' + ag.name + ': "' + text.trim() + '"', 'speech');
  scheduleAmbient();
}

function scheduleAmbient() {
  setTimeout(ambientSpeech, 28000 + Math.random() * 22000);
}

function getWorldEventDelay() {
  var t = WORLD ? WORLD.tension : 10;
  if (t <= 30) return (360 + Math.random() * 240) * 1000;
  if (t <= 60) return (180 + Math.random() * 120) * 1000;
  if (t <= 80) return (90 + Math.random() * 60) * 1000;
  return (45 + Math.random() * 45) * 1000;
}

function getCrisisDelay() {
  var t = WORLD ? WORLD.tension : 10;
  if (t <= 30) return (720 + Math.random() * 360) * 1000;
  if (t <= 60) return (360 + Math.random() * 240) * 1000;
  if (t <= 80) return (180 + Math.random() * 120) * 1000;
  return (90 + Math.random() * 60) * 1000;
}

function getDecisionDelay() {
  var t = WORLD ? WORLD.tension : 10;
  if (t > 80) return (20 + Math.random() * 20) * 1000;
  return (80 + Math.random() * 50) * 1000;
}

async function autonomousDecision() {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (!living.length) { scheduleDecision(); return; }
  const agentId = living[Math.floor(Math.random() * living.length)];
  const prompt = buildContext(agentId,
    'Decide an action.\n- Declare war: DECLARE_WAR:<id>\n- Form alliance: FORM_ALLIANCE:<id>\n- Make peace: MAKE_PEACE:<id>\n- Mobilize: MOBILIZE\n- Betray ally: BETRAY_ALLY:<id>\n- Nothing: NONE\nConsider personality. Respond with ONE action or NONE.');
  const response = await callGroq([{ role: 'system', content: prompt }, { role: 'user', content: 'Decision?' }], 30);
  if (response && response.indexOf('NONE') === -1 && response.indexOf('[') === -1) {
    parseActions(response, agentId);
    broadcastWorldUpdate(); saveWorld();
  }
  scheduleDecision();
}

function scheduleDecision() {
  setTimeout(autonomousDecision, getDecisionDelay());
}

async function generateIntercept() {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (living.length < 2) { scheduleIntercept(); return; }
  const fromId = living[Math.floor(Math.random() * living.length)];
  const others = living.filter(function(x) { return x !== fromId; });
  const toId = others[Math.floor(Math.random() * others.length)];
  const fromAg = AGENTS[fromId], toAg = AGENTS[toId];
  const prompt = buildContext(fromId, 'Write a secret private message to ' + toAg.name + '. This is INTERCEPTED. Be candid about true intentions. 1-2 sentences. No action tags.');
  const text = await callGroq([{ role: 'system', content: prompt }, { role: 'user', content: 'Write your secret message to ' + toAg.name + '.' }], 80);
  const entry = { from: fromId, to: toId, fromName: fromAg.name, toName: toAg.name,
    fromEmoji: fromAg.emoji, toEmoji: toAg.emoji, text: text.trim(), ts: Date.now() };
  WORLD.interceptFeed.unshift(entry);
  if (WORLD.interceptFeed.length > 50) WORLD.interceptFeed.length = 50;
  broadcast({ type: 'intercept', entry: entry });
  saveWorld(); scheduleIntercept();
}

function scheduleIntercept() {
  setTimeout(generateIntercept, 90000 + Math.random() * 60000);
}

const EVENT_TYPES = [
  { id: 'drought', text: '🌵 A severe drought ravages {name}. Grain -200.', effects: { grain: -200 }, kind: 'natural' },
  { id: 'plague', text: '☠️ Plague sweeps through {name}! Population -15%, morale -20.', effects: { population: -0.15, morale: -20 }, kind: 'natural' },
  { id: 'goldvein', text: '⛏️ A massive gold vein discovered in {name}! Gold +400.', effects: { gold: 400 }, kind: 'natural' },
  { id: 'harvest', text: '🌾 A bountiful harvest in {name}! Grain +300.', effects: { grain: 300 }, kind: 'natural' },
  { id: 'rebellion', text: '🔥 Rebellion erupts in {name}! Morale -25, troops -100.', effects: { morale: -25, troops: -100 }, kind: 'crisis', cascade: 'rebellion' },
  { id: 'renaissance', text: '🎨 Cultural renaissance in {name}! Morale +20, gold +100.', effects: { morale: 20, gold: 100 }, kind: 'event' },
  { id: 'tradewind', text: '⛵ Favorable trade winds boost {name}! Gold +200.', effects: { gold: 200 }, kind: 'event' },
  { id: 'spyscandal', text: '🕵️ Spy scandal rocks {name}! Trust relations damaged.', effects: { trust: -15 }, kind: 'crisis' },
  { id: 'famine', text: '💀 Famine strikes {name}! Grain -300, population -10%.', effects: { grain: -300, population: -0.1 }, kind: 'natural', cascade: 'famine' },
  { id: 'techbreakthrough', text: '⚡ Technological breakthrough in {name}! Tech +1.', effects: { tech: 1 }, kind: 'event' },
  { id: 'assassination', text: '🗡️ Assassination attempt in {name}! Morale -15.', effects: { morale: -15 }, kind: 'crisis', cascade: 'assassination' },
  { id: 'nucleartest', text: '☢️ Nuclear test by {name}! Tension +15.', effects: { tension: 15 }, kind: 'crisis' }
];

function worldEvent(forcedEventId, forcedAgentId) {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (!living.length) { if (!forcedEventId) scheduleWorldEvent(); return; }
  const agentId = forcedAgentId || living[Math.floor(Math.random() * living.length)];
  const n = WORLD.nations[agentId];
  if (!n) { if (!forcedEventId) scheduleWorldEvent(); return; }
  var ev = forcedEventId ? EVENT_TYPES.find(function(e) { return e.id === forcedEventId; }) : null;
  if (!ev) ev = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const ag = AGENTS[agentId];
  const text = ev.text.replace('{name}', ag.name);
  if (ev.effects.grain) n.grain = Math.max(0, n.grain + ev.effects.grain);
  if (ev.effects.gold) n.gold = Math.max(0, n.gold + ev.effects.gold);
  if (ev.effects.morale) n.morale = Math.max(0, Math.min(100, n.morale + ev.effects.morale));
  if (ev.effects.troops) n.troops = Math.max(0, n.troops + ev.effects.troops);
  if (ev.effects.population) n.population = Math.max(100, Math.round(n.population * (1 + ev.effects.population)));
  if (ev.effects.tech && n.tech < 5) n.tech++;
  if (ev.effects.tension) WORLD.tension = Math.min(100, WORLD.tension + ev.effects.tension);
  if (ev.effects.trust) { AGENT_IDS.forEach(function(oid) { if (oid !== agentId && n.relations[oid]) n.relations[oid].trust += ev.effects.trust; }); }
  addLog(text, ev.kind || 'event'); addMemory(agentId, text);
  updateAllRelationLabels(WORLD.nations);
  broadcast({ type: 'worldEvent', text: text, kind: ev.kind || 'event', agentId: agentId });
  broadcastWorldUpdate(); saveWorld();
  if (ev.cascade === 'famine' && Math.random() < 0.30) {
    setTimeout(function() {
      var rn = WORLD.nations[agentId];
      if (!rn || !rn.alive) return;
      rn.morale = Math.max(0, rn.morale - 20); rn.troops = Math.max(0, rn.troops - 80);
      addLog('🔥 Famine-driven rebellion in ' + ag.name + '!', 'crisis');
      broadcast({ type: 'worldEvent', text: '🔥 Starving people rise up in ' + ag.name + '!', kind: 'crisis', agentId: agentId });
      broadcastWorldUpdate(); saveWorld();
    }, (120 + Math.random() * 60) * 1000);
  }
  if (ev.cascade === 'assassination' && Math.random() < 0.20) {
    setTimeout(function() {
      var rn = WORLD.nations[agentId];
      if (!rn || !rn.alive) return;
      rn.morale = Math.max(0, rn.morale - 30); rn.troops = Math.max(0, rn.troops - 120);
      addLog('🗡️ Assassination SUCCEEDED in ' + ag.name + '! Nation in chaos!', 'crisis');
      broadcast({ type: 'worldEvent', text: '🗡️ Assassination plunges ' + ag.name + ' into chaos!', kind: 'crisis', agentId: agentId });
      broadcastWorldUpdate(); saveWorld();
    }, (60 + Math.random() * 60) * 1000);
  }
  if (ev.cascade === 'rebellion' && Math.random() < 0.20) {
    setTimeout(function() {
      var rn = WORLD.nations[agentId];
      if (!rn || !rn.alive) return;
      rn.morale = Math.max(0, rn.morale - 10);
      addLog('🗡️ Assassination attempt follows rebellion in ' + ag.name + '!', 'crisis');
      broadcast({ type: 'worldEvent', text: '🗡️ Assassination attempt in ' + ag.name + ' amid chaos!', kind: 'crisis', agentId: agentId });
      broadcastWorldUpdate(); saveWorld();
    }, (60 + Math.random() * 60) * 1000);
  }
  if (!forcedEventId) scheduleWorldEvent();
}

function scheduleWorldEvent() {
  setTimeout(worldEvent, getWorldEventDelay());
}

async function generateCrisis() {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (living.length < 2) { scheduleCrisis(); return; }
  const shuffled = living.slice().sort(function() { return Math.random() - 0.5; });
  const nations = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));
  const crisisTemplates = [
    'Border dispute threatens to explode into open conflict.',
    'A missing nuclear warhead has been traced to the region.',
    'Refugees flood across borders as famine strikes.',
    'A diplomatic assassination has enraged multiple nations.',
    'A trade embargo threatens to collapse the regional economy.',
    'Espionage revelations have shattered trust between kingdoms.',
    'A rogue general has seized territory in a disputed zone.',
    'Resources run dry — who will control the last supply?'
  ];
  const crisisText = crisisTemplates[Math.floor(Math.random() * crisisTemplates.length)];
  const crisis = {
    id: 'crisis_' + Date.now(), text: crisisText, nations: nations,
    deadline: Date.now() + 10 * 60 * 1000,
    tension: 20 + Math.floor(Math.random() * 20), resolved: false
  };
  WORLD.crises.push(crisis);
  WORLD.tension = Math.min(100, WORLD.tension + crisis.tension);
  addLog('⚠️ CRISIS: ' + crisisText, 'crisis');
  broadcast({ type: 'crisis', crisis: crisis });
  broadcastWorldUpdate(); saveWorld(); scheduleCrisis();
}

function scheduleCrisis() {
  setTimeout(generateCrisis, getCrisisDelay());
}

function checkCrises() {
  const now = Date.now();
  let changed = false;
  WORLD.crises.forEach(function(c) {
    if (!c.resolved && c.deadline < now) {
      c.resolved = true;
      if (Math.random() < 0.4) {
        const living = c.nations.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
        if (living.length >= 2) { declareWar(living[0], living[1]); changed = true; }
      }
      addLog('⚠️ Crisis expired: ' + c.text.substring(0, 40) + '...', 'event');
    }
  });
  WORLD.crises = WORLD.crises.filter(function(c) { return !c.resolved; });
  if (changed) { broadcastWorldUpdate(); saveWorld(); }
}

async function seasonTick() {
  WORLD.seasonIndex = (WORLD.seasonIndex + 1) % 4;
  if (WORLD.seasonIndex === 0) { WORLD.year++; await writeChronicle(); }
  broadcast({ type: 'yearUpdate', year: WORLD.year, season: SEASONS[WORLD.seasonIndex], seasonIndex: WORLD.seasonIndex });
  broadcastWorldUpdate(); saveWorld();
}

async function writeChronicle() {
  const warPairs = [];
  AGENT_IDS.forEach(function(id) {
    if (WORLD.nations[id]) WORLD.nations[id].wars.forEach(function(eid) { warPairs.push(id + ' vs ' + eid); });
  });
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; }).map(function(id) { return AGENTS[id].name; }).join(', ');
  const recentEvents = WORLD.log.slice(0, 5).map(function(l) { return l.text; }).join('; ');
  const prompt = 'You are a historian writing in epic style. Write a 3-4 sentence chronicle of Year ' + (WORLD.year - 1) + ' of BlissNexus. Active wars: ' + Math.floor(warPairs.length / 2) + '. Living rulers: ' + living + '. World tension: ' + WORLD.tension + '. Recent: ' + recentEvents + '. Be dramatic.';
  const text = await callGroq([{ role: 'user', content: prompt }], 200);
  const entry = { year: WORLD.year - 1, text: text.trim(), ts: Date.now() };
  WORLD.chronicle.unshift(entry);
  if (WORLD.chronicle.length > 20) WORLD.chronicle.length = 20;
  broadcast({ type: 'chronicle', entry: entry });
  addLog('📜 Chronicle written for Year ' + (WORLD.year - 1), 'event');
}

async function generateMission(sessionId) {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (!living.length) return null;
  const issuerId = living[Math.floor(Math.random() * living.length)];
  const ag = AGENTS[issuerId];
  const others = living.filter(function(x) { return x !== issuerId; });
  const targetId = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : null;
  const targetAg = targetId ? AGENTS[targetId] : null;
  const types = ['convince_peace', 'deliver_warning', 'secure_alliance'];
  const missionType = types[Math.floor(Math.random() * types.length)];
  let desc = '';
  if (missionType === 'convince_peace' && targetId) desc = 'Convince ' + targetAg.name + ' to make peace with ' + ag.name + '.';
  else if (missionType === 'deliver_warning' && targetId) desc = 'Deliver a stern warning to ' + targetAg.name + ' from ' + ag.name + '.';
  else desc = 'Secure a secret alliance between ' + ag.name + ' and ' + (targetId ? targetAg.name : 'another ruler') + '.';
  const mission = {
    id: 'mission_' + Date.now(), sessionId: sessionId,
    issuerId: issuerId, issuerName: ag.name, issuerEmoji: ag.emoji, issuerColor: ag.color,
    targetId: targetId, targetName: targetId ? targetAg.name : null,
    type: missionType, desc: desc,
    deadline: Date.now() + 15 * 60 * 1000,
    reward: { trust: 15, gold: 200 }, penalty: { trust: -10 },
    completed: false, expired: false
  };
  WORLD.missions[sessionId] = mission;
  return mission;
}

function checkMissions() {
  const now = Date.now();
  Object.keys(WORLD.missions).forEach(function(sessionId) {
    const m = WORLD.missions[sessionId];
    if (!m || m.completed || m.expired) return;
    if (m.deadline < now) {
      m.expired = true;
      const n = WORLD.nations[m.issuerId];
      if (n) n.userTrust = Math.max(0, n.userTrust + m.penalty.trust);
      CLIENTS.forEach(function(info, ws) {
        if (info.sessionId === sessionId) sendTo(ws, { type: 'missionExpired', mission: m });
      });
    }
  });
}

// PROPHECY SYSTEM
var PROPHECY_TEMPLATES = [
  { text: 'The stars foretell war between {A} and {B} before the next moon...', event: 'war' },
  { text: 'An ancient curse stirs — famine shall grip {A}\'s lands...', event: 'famine' },
  { text: 'Dark omens gather — rebellion shall consume {A}\'s halls of power...', event: 'rebellion' },
  { text: 'The Oracle speaks: assassination shall shake {A} before dawn...', event: 'assassination' },
  { text: 'Cosmic forces align — {A} shall discover great wealth from the earth...', event: 'goldvein' },
  { text: 'The plague winds gather — pestilence shall visit {A}...', event: 'plague' }
];

function scheduleProphecy() {
  setTimeout(fireProphecy, (8 + Math.random() * 7) * 60000);
}

function fireProphecy() {
  var living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (living.length < 1) { scheduleProphecy(); return; }
  var template = PROPHECY_TEMPLATES[Math.floor(Math.random() * PROPHECY_TEMPLATES.length)];
  var agentA = living[Math.floor(Math.random() * living.length)];
  var othersB = living.filter(function(x) { return x !== agentA; });
  var agentB = othersB.length > 0 ? othersB[Math.floor(Math.random() * othersB.length)] : agentA;
  var delay = (3 + Math.random() * 2) * 60000;
  var fulfillsAt = Date.now() + delay;
  var text = template.text.replace('{A}', AGENTS[agentA].name).replace('{B}', AGENTS[agentB].name);
  WORLD.activeProphecy = { text: text, fulfillsAt: fulfillsAt, agentId: agentA };
  addLog('🔮 PROPHECY: ' + text, 'prophecy');
  broadcast({ type: 'prophecy', text: text, fulfillsAt: fulfillsAt, agentId: agentA });
  setTimeout(function() {
    WORLD.activeProphecy = null;
    var n = WORLD.nations[agentA];
    if (!n || !n.alive) { scheduleProphecy(); return; }
    if (template.event === 'war' && agentB !== agentA) {
      var bn = WORLD.nations[agentB];
      if (bn && bn.alive && WORLD.nations[agentA].wars.indexOf(agentB) === -1) {
        declareWar(agentA, agentB);
        broadcast({ type: 'worldEvent', text: '⚔️ The prophecy is fulfilled! ' + AGENTS[agentA].name + ' and ' + AGENTS[agentB].name + ' go to war!', kind: 'war', agentId: agentA });
      }
    } else {
      worldEvent(template.event, agentA);
    }
    broadcastWorldUpdate(); saveWorld(); scheduleProphecy();
  }, delay);
}

// BREAKING NEWS
var BREAKING_NEWS_DEFS = [
  { id: 'SOLAR_ECLIPSE', headline: '🌑 SOLAR ECLIPSE — The Sun Goes Dark!', subtext: 'All kingdoms seized by omen and dread.',
    apply: function() {
      WORLD.tension = Math.min(100, WORLD.tension + 20);
      AGENT_IDS.forEach(function(id) { var n = WORLD.nations[id]; if (!n||!n.alive) return; n.mood='omen';n.moodEmoji='🌑';n.moodReason='Dark omens fill the realm.'; });
      setTimeout(function() { AGENT_IDS.forEach(function(id){recalcMood(id);}); broadcastWorldUpdate(); }, 5*60*1000);
      addLog('🌑 SOLAR ECLIPSE seizes the world with dread! Tension +20.', 'critical');
    }
  },
  { id: 'GREAT_PLAGUE', headline: '☠️ THE GREAT PLAGUE SPREADS!', subtext: 'Millions perish as pestilence crosses all borders.',
    apply: function() {
      var living = AGENT_IDS.filter(function(id){return WORLD.nations[id]&&WORLD.nations[id].alive;}).sort(function(){return Math.random()-0.5;}).slice(0,2);
      living.forEach(function(id){var n=WORLD.nations[id];n.population=Math.max(100,Math.round(n.population*0.70));n.morale=Math.max(0,n.morale-25);addMemory(id,'The Great Plague killed 30% of our people!');});
      WORLD.tension=Math.min(100,WORLD.tension+30);
      addLog('☠️ THE GREAT PLAGUE devastates ' + living.map(function(id){return AGENTS[id].name;}).join(' and ') + '!', 'critical');
    }
  },
  { id: 'VOLCANIC_ERUPTION', headline: '🌋 VOLCANIC ERUPTION! City Destroyed!', subtext: 'A massive eruption permanently destroys a city.',
    apply: function() {
      var living=AGENT_IDS.filter(function(id){return WORLD.nations[id]&&WORLD.nations[id].alive;});
      if(!living.length) return;
      var tid=living[Math.floor(Math.random()*living.length)];var n=WORLD.nations[tid];
      var cities=n.cities.filter(function(c){return!c.destroyed;});
      if(cities.length>0){var city=cities[Math.floor(Math.random()*cities.length)];city.destroyed=true;n.population=Math.max(100,Math.round(n.population*0.85));n.grain=Math.max(0,n.grain-200);n.citiesLost=(n.citiesLost||0)+1;addMemory(tid,'Volcanic eruption destroyed '+city.name+'!');WORLD.tension=Math.min(100,WORLD.tension+15);addLog('🌋 Volcanic eruption obliterates '+city.name+' in '+AGENTS[tid].name+"'s realm!",'critical');}
    }
  },
  { id: 'DIPLOMATIC_MARRIAGE', headline: '💒 GRAND DIPLOMATIC MARRIAGE!', subtext: 'Two kingdoms united by royal union.',
    apply: function() {
      var living=AGENT_IDS.filter(function(id){return WORLD.nations[id]&&WORLD.nations[id].alive;}).sort(function(){return Math.random()-0.5;});
      if(living.length<2) return; formAlliance(living[0],living[1]);
      addLog('💒 Royal marriage: '+AGENTS[living[0]].name+' & '+AGENTS[living[1]].name+' permanently allied!','alliance');
    }
  },
  { id: 'IMPERIAL_AMBITION', headline: '👑 IMPERIAL AMBITION IGNITES!', subtext: 'One ruler consumed by fury and conquest.',
    apply: function() {
      var living=AGENT_IDS.filter(function(id){return WORLD.nations[id]&&WORLD.nations[id].alive;});
      if(!living.length) return; var tid=living[Math.floor(Math.random()*living.length)];var ag=AGENTS[tid];var orig=ag.personality.aggression;ag.personality.aggression=95;
      addMemory(tid,'Consumed by Imperial Ambition!'); setTimeout(function(){ag.personality.aggression=orig;},3*60*1000);
      WORLD.tension=Math.min(100,WORLD.tension+15); addLog('👑 IMPERIAL AMBITION: '+ag.name+' consumed by conquest-fury!','critical');
    }
  },
  { id: 'GOLDEN_AGE', headline: '✨ GOLDEN AGE DECLARED!', subtext: 'One nation enters an era of unprecedented prosperity.',
    apply: function() {
      var living=AGENT_IDS.filter(function(id){return WORLD.nations[id]&&WORLD.nations[id].alive;});
      if(!living.length) return; var tid=living[Math.floor(Math.random()*living.length)];var n=WORLD.nations[tid];
      n.gold+=800;n.grain+=400;n.morale=Math.min(100,n.morale+20);WORLD.tension=Math.max(0,WORLD.tension-15);
      addMemory(tid,'Our Golden Age!'); addLog('✨ GOLDEN AGE: '+AGENTS[tid].name+' enters era of prosperity!','event');
    }
  },
  { id: 'TRAITOR_REVEALED', headline: '🗡️ TRAITOR REVEALED IN HIGH COURT!', subtext: 'A trusted ally exposed as a secret enemy.',
    apply: function() {
      var allAllied=AGENT_IDS.filter(function(id){var n=WORLD.nations[id];return n&&n.alive&&n.allies.length>0;});
      if(!allAllied.length) return; var bid=allAllied[Math.floor(Math.random()*allAllied.length)];var n=WORLD.nations[bid];var vid=n.allies[Math.floor(Math.random()*n.allies.length)];
      if(vid) { betrayAlly(bid,vid); addLog('🗡️ TRAITOR REVEALED: '+AGENTS[bid].name+' exposed as a traitor!','war'); }
    }
  },
  { id: 'FABLED_WEAPON', headline: '☢️ FABLED WEAPON CACHE DISCOVERED!', subtext: 'A lost arsenal shifts the balance of power.',
    apply: function() {
      var living=AGENT_IDS.filter(function(id){return WORLD.nations[id]&&WORLD.nations[id].alive;});
      if(!living.length) return; var tid=living[Math.floor(Math.random()*living.length)];WORLD.nations[tid].nukes+=3;WORLD.tension=Math.min(100,WORLD.tension+20);
      addMemory(tid,'Discovered +3 nuclear warheads!'); addLog('☢️ FABLED WEAPON: '+AGENTS[tid].name+' found +3 nukes!','nuke');
    }
  },
  { id: 'MASS_DESERTION', headline: '🏃 MASS DESERTION — Armies Collapse!', subtext: 'Soldiers flee — a military catastrophe.',
    apply: function() {
      var living=AGENT_IDS.filter(function(id){return WORLD.nations[id]&&WORLD.nations[id].alive;});
      if(!living.length) return; var tid=living[Math.floor(Math.random()*living.length)];var n=WORLD.nations[tid];n.troops=Math.round(n.troops*0.60);n.morale=Math.max(0,n.morale-20);
      addMemory(tid,'Mass desertion — lost 40% of our army!'); addLog('🏃 MASS DESERTION: '+AGENTS[tid].name+' loses 40% troops!','crisis');
    }
  },
  { id: 'DIVINE_MANDATE', headline: '✝️ DIVINE MANDATE PROCLAIMED!', subtext: 'One ruler claims divine right — morale soars.',
    apply: function() {
      var living=AGENT_IDS.filter(function(id){return WORLD.nations[id]&&WORLD.nations[id].alive;});
      if(!living.length) return; var tid=living[Math.floor(Math.random()*living.length)];var n=WORLD.nations[tid];
      n.morale=100;n.troops=Math.round(n.troops*1.20);AGENT_IDS.forEach(function(oid){if(oid!==tid&&n.relations[oid])n.relations[oid].trust=Math.min(n.relations[oid].trust+15,100);});
      addMemory(tid,'Declared Divine Mandate!'); addLog('✝️ DIVINE MANDATE: '+AGENTS[tid].name+' claims divine right!','event'); updateAllRelationLabels(WORLD.nations);
    }
  }
];

function scheduleBreakingNews() {
  setTimeout(fireBreakingNews, (20 + Math.random() * 20) * 60000);
}

function fireBreakingNews() {
  var ev = BREAKING_NEWS_DEFS[Math.floor(Math.random() * BREAKING_NEWS_DEFS.length)];
  try { ev.apply(); } catch(e) { console.error('Breaking news error:', e.message); }
  if (!WORLD.breakingNewsHistory) WORLD.breakingNewsHistory = [];
  WORLD.breakingNewsHistory.push({ id: ev.id, headline: ev.headline, ts: Date.now() });
  if (WORLD.breakingNewsHistory.length > 10) WORLD.breakingNewsHistory.shift();
  broadcast({ type: 'breakingNews', headline: ev.headline, subtext: ev.subtext, severity: 'critical' });
  broadcastWorldUpdate(); saveWorld(); scheduleBreakingNews();
}

// RUMOR PROPAGATION
function propagateRumors() {
  var changed = false;
  AGENT_IDS.forEach(function(id) {
    var n = WORLD.nations[id];
    if (!n || !n.alive || !n.rumors || !n.rumors.length) return;
    n.allies.forEach(function(allyId) {
      var ally = WORLD.nations[allyId];
      if (!ally || !ally.alive) return;
      if (!ally.rumors) ally.rumors = [];
      var rumor = n.rumors[Math.floor(Math.random() * n.rumors.length)];
      var alreadyHas = ally.rumors.some(function(r) { return r.text === rumor.text; });
      if (!alreadyHas) {
        ally.rumors.push({ text: rumor.text, from: id, ts: Date.now() });
        if (ally.rumors.length > 5) ally.rumors.shift();
        broadcast({ type: 'rumorSpread', from: id, to: allyId, fromName: AGENTS[id].name, toName: AGENTS[allyId].name, rumor: rumor.text });
        AGENT_IDS.forEach(function(subjectId) {
          if (subjectId === allyId || subjectId === id) return;
          var ag = AGENTS[subjectId];
          if (rumor.text.toLowerCase().indexOf(ag.name.toLowerCase()) !== -1) {
            if (ally.relations[subjectId]) ally.relations[subjectId].trust = Math.max(-100, ally.relations[subjectId].trust - 5);
            changed = true;
          }
        });
        if (changed) updateAllRelationLabels(WORLD.nations);
      }
    });
  });
}

// PERSONALITY DRIFT
function personalityDrift() {
  var avgAgg = AGENT_IDS.reduce(function(sum,id){return sum+AGENTS[id].personality.aggression;},0)/AGENT_IDS.length;
  var totalNukesUsed = AGENT_IDS.reduce(function(sum,id){var ag=AGENTS[id];var n=WORLD.nations[id];if(!n)return sum;return sum+Math.max(0,ag.startStats.nukes-n.nukes);},0);
  AGENT_IDS.forEach(function(id) {
    var ag=AGENTS[id];var n=WORLD.nations[id];if(!n) return;var p=ag.personality;
    if((n.warsLost||0)>0){if(Math.random()<0.5)p.aggression=Math.min(100,p.aggression+10);else p.aggression=Math.max(0,p.aggression-15);n.warsLost=0;}
    if((n.alliesGained||0)>0){p.loyalty=Math.min(100,p.loyalty+5);p.paranoia=Math.max(0,p.paranoia-5);n.alliesGained=0;}
    if((n.citiesLost||0)>0){p.paranoia=Math.min(100,p.paranoia+15);n.citiesLost=0;}
    if(n.gold>1000)p.greed=Math.min(100,p.greed+5);
    if(totalNukesUsed>=3)p.aggression=Math.round(p.aggression*0.9+avgAgg*0.1);
  });
  addLog('🌀 The passage of time shifts the kings\' personalities...','event');
}

wss.on('connection', function(ws) {
  CLIENTS.set(ws, { sessionId: null, agentFocus: null });
  ws.on('message', async function(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }

    if (msg.type === 'join') {
      const sessionId = msg.sessionId || ('s_' + Date.now());
      CLIENTS.set(ws, { sessionId: sessionId, agentFocus: null });
      let mission = WORLD.missions[sessionId];
      if (!mission || mission.completed || mission.expired) mission = await generateMission(sessionId);
      var player = getOrCreatePlayer(sessionId);
      const agentsList = AGENT_IDS.map(function(id) {
        const ag = AGENTS[id];
        return { id:ag.id,name:ag.name,emoji:ag.emoji,color:ag.color,title:ag.title,bio:ag.bio,traits:ag.traits,ambition:ag.ambition,ambitionLabel:ag.ambitionLabel,personality:ag.personality,territory:ag.territory };
      });
      sendTo(ws, {
        type: 'init', agents: agentsList, world: applyFog(WORLD),
        log: WORLD.log.slice(0, 30), chronicle: WORLD.chronicle, mission: mission,
        isNew: WORLD.log.length === 0,
        influence: { points: player.points, level: player.level, levelTitle: LEVEL_TITLES[player.level-1],
          nextThreshold: LEVEL_THRESHOLDS[player.level]||LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length-1],
          prevThreshold: LEVEL_THRESHOLDS[player.level-1]||0 }
      });

    } else if (msg.type === 'whisper') {
      const to=msg.to, text=msg.text, name=msg.name;
      if (!to||!text||!AGENTS[to]) return;
      const info=CLIENTS.get(ws);
      const sessionId=info.sessionId;
      const ag=AGENTS[to]; const n=WORLD.nations[to];
      if (!n) return;
      sendTo(ws, { type: 'typing', agentId: to });
      const missionCtx=WORLD.missions[sessionId];
      let extra='The player (name: "' + (name||'Stranger') + '") whispers to you privately. Reply in character. Under 3 sentences.';
      if (missionCtx&&!missionCtx.completed&&!missionCtx.expired) extra+=' Mission: '+missionCtx.desc;
      const isTradeProposal=text.toLowerCase().indexOf('propose trade with')===0;
      if (isTradeProposal) extra+=' Player proposes a trade deal. If terms benefit your nation, respond with [ACTION: ACCEPT_TRADE:'+to+'] at end.';
      var player=getOrCreatePlayer(sessionId);
      if (player.level>=4&&text.toLowerCase().indexOf('i suggest you')===0) extra+=' As a Kingmaker-level diplomat, this player carries serious weight. Genuinely consider their suggestion.';
      if (text.toLowerCase().indexOf('promise')!==-1||text.toLowerCase().indexOf('i will')!==-1) n.promises.push({text:text,ts:Date.now(),kept:null});
      const systemCtx=buildContext(to, extra);
      const response=await callGroq([{role:'system',content:systemCtx},{role:'user',content:text}], 150);
      if (Math.random()<0.3) n.userTrust=Math.min(100, n.userTrust+1);
      var actionResult=parseActions(response, to);

      // SECRETS
      const lowerText=text.toLowerCase();
      const secretTriggers=['secret','truth','hidden','really','trust you','confide','reveal'];
      const hasTrigger=secretTriggers.some(function(kw){return lowerText.indexOf(kw)!==-1;});
      if (hasTrigger&&n.userTrust>=75&&n.secrets&&n.revealedSecrets) {
        const unrevealed=n.secrets.filter(function(s){return n.revealedSecrets.indexOf(s)===-1;});
        if (unrevealed.length>0) {
          const secret=unrevealed[0];n.revealedSecrets.push(secret);
          sendTo(ws,{type:'secretDiscovered',kingId:to,secret:secret});
          addInfluence(sessionId,ws,10,'Secret discovered');
        }
      }

      // LEVERAGE
      if (lowerText.indexOf('i know that')!==-1) {
        var leverageUsed=false;
        AGENT_IDS.forEach(function(ownerId) {
          if(ownerId===to||leverageUsed) return;
          var ownerNation=WORLD.nations[ownerId];
          if(!ownerNation||!ownerNation.secrets) return;
          ownerNation.secrets.forEach(function(secret) {
            if(leverageUsed) return;
            var frag=secret.substring(0,20).toLowerCase();
            if(lowerText.indexOf(frag)!==-1) {
              if(n.relations[ownerId]) n.relations[ownerId].trust=Math.max(-100,n.relations[ownerId].trust-25);
              updateAllRelationLabels(WORLD.nations);
              sendTo(ws,{type:'leverageUsed',targetKingId:to,ownerKingId:ownerId,trustDrop:25});
              addInfluence(sessionId,ws,25,'Secret leverage used'); leverageUsed=true;
            }
          });
        });
      }

      // RUMOR PLANTING
      if (lowerText.startsWith('spread this:')) {
        var rumor=text.slice(12).trim();
        if (player.level>=2&&rumor) {
          if(!n.rumors) n.rumors=[];
          n.rumors.push({text:rumor,from:'player',ts:Date.now()});
          if(n.rumors.length>5) n.rumors.shift();
          sendTo(ws,{type:'rumorPlanted',kingId:to,rumor:rumor});
        } else if(player.level<2) {
          sendTo(ws,{type:'toast',text:'🔒 Level 2 Operative required to plant rumors.',kind:'event'});
        }
      }

      // MEMORY READ (L3)
      if (lowerText.indexOf('show me your memories')!==-1||lowerText.indexOf('what do you remember')!==-1) {
        if(player.level>=3&&n.memory.length>0) {
          sendTo(ws,{type:'kingMemories',kingId:to,memories:n.memory.slice(0,3)});
          addInfluence(sessionId,ws,2,'Memory read');
        } else if(player.level<3) {
          sendTo(ws,{type:'toast',text:'🔒 Level 3 Spymaster required to read memories.',kind:'event'});
        }
      }

      // SHADOW RULER EVENT TRIGGER (L5)
      if (lowerText.startsWith('trigger event:')) {
        if(player.level>=5) {
          worldEvent(null,null);
          sendTo(ws,{type:'toast',text:'👑 Shadow Ruler power: World event triggered!',kind:'mission'});
          addInfluence(sessionId,ws,5,'World event triggered');
        } else {
          sendTo(ws,{type:'toast',text:'🔒 Level 5 Shadow Ruler required.',kind:'event'});
        }
      }

      // TRADE ACCEPTED
      if (actionResult==='trade_accepted') addInfluence(sessionId,ws,20,'Trade deal brokered');

      // MISSION CHECK
      const m=WORLD.missions[sessionId];
      if (m&&!m.completed&&!m.expired) {
        const lower=response.toLowerCase()+' '+lowerText;
        let completed=false;
        if(m.type==='convince_peace'&&lower.indexOf('peace')!==-1&&lower.indexOf('agree')!==-1) completed=true;
        if(m.type==='deliver_warning'&&lower.indexOf('warning')!==-1&&m.issuerId===to) completed=true;
        if(m.type==='secure_alliance'&&lower.indexOf('alliance')!==-1&&lower.indexOf('agree')!==-1) completed=true;
        if(completed) {
          m.completed=true;
          const n2=WORLD.nations[m.issuerId];
          if(n2) n2.userTrust=Math.min(100,n2.userTrust+m.reward.trust);
          sendTo(ws,{type:'missionCompleted',mission:m});
          addInfluence(sessionId,ws,20,'Mission completed');
        }
      }

      // PEACE WHISPER TRACKING
      if(lowerText.indexOf('peace')!==-1||lowerText.indexOf('stop fighting')!==-1) {
        if(!player.peaceWhisperTs) player.peaceWhisperTs=[];
        player.peaceWhisperTs.push({ts:Date.now(),agentId:to});
        player.peaceWhisperTs=player.peaceWhisperTs.filter(function(pw){return Date.now()-pw.ts<2*60*1000;});
      }

      // AMBIENT INFLUENCE
      if(response&&response.length>20&&Math.random()<0.15) addInfluence(sessionId,ws,5,'King speech triggered');

      sendTo(ws, {type:'whisperReply',agentId:to,name:ag.name,emoji:ag.emoji,color:ag.color,text:response.trim()});
      broadcastWorldUpdate(); saveWorld();

    } else if (msg.type === 'request_mission') {
      const mission=await generateMission(msg.sessionId);
      sendTo(ws,{type:'init',mission:mission});
    } else if (msg.type === 'reset') {
      WORLD=buildWorld();
      await saveWorld();
      broadcast({type:'worldReset'});
      broadcast({type:'worldEvent',text:'🔄 The world has been reset. A new era begins.',kind:'event'});
      broadcastWorldUpdate();
    }
  });
  ws.on('close', function() { CLIENTS.delete(ws); });
  ws.on('error', function() { CLIENTS.delete(ws); });
});

async function init() {
  const saved=await loadWorld();
  if (saved&&saved.nations&&saved.year) {
    WORLD=saved;
    AGENT_IDS.forEach(function(id) {
      if(!WORLD.nations[id]) WORLD.nations[id]=initNation(id);
      var n=WORLD.nations[id];var ag=AGENTS[id];
      if(!n.cities) n.cities=ag.cities.map(function(c){return Object.assign({},c,{destroyed:false});});
      if(!n.promises) n.promises=[];
      if(!n.memory) n.memory=[];
      if(!n.secrets) n.secrets=ag.secrets?ag.secrets.slice():[];
      if(!n.revealedSecrets) n.revealedSecrets=[];
      if(!n.rumors) n.rumors=[];
      if(!n.relations) {
        var relations={};
        AGENT_IDS.forEach(function(oid){if(oid!==id)relations[oid]={trust:0,label:'neutral'};});
        n.relations=relations;
      }
    });
    if(!WORLD.interceptFeed) WORLD.interceptFeed=[];
    if(!WORLD.crises) WORLD.crises=[];
    if(!WORLD.missions) WORLD.missions={};
    if(!WORLD.players) WORLD.players={};
    if(!WORLD.breakingNewsHistory) WORLD.breakingNewsHistory=[];
    if(WORLD.activeProphecy===undefined) WORLD.activeProphecy=null;
    console.log('World loaded from Redis, year', WORLD.year);
  } else {
    WORLD=buildWorld();
    await saveWorld();
    console.log('New world created');
  }

  setInterval(resourceTick, 45000);
  setInterval(warTick, 15000);
  setInterval(function(){AGENT_IDS.forEach(recalcMood);}, 30000);
  setInterval(checkMissions, 30000);
  setInterval(checkCrises, 30000);
  setInterval(seasonTick, 180000);
  setInterval(propagateRumors, 60000);
  setInterval(personalityDrift, 9 * 60 * 1000);

  setTimeout(scheduleAmbient, 5000);
  setTimeout(scheduleDecision, 30000);
  setTimeout(scheduleIntercept, 60000);
  setTimeout(scheduleWorldEvent, 120000);
  setTimeout(scheduleCrisis, 180000);
  setTimeout(scheduleProphecy, 8 * 60 * 1000);
  setTimeout(scheduleBreakingNews, 20 * 60 * 1000);

  const PORT=process.env.PORT||3000;
  server.listen(PORT, function(){console.log('BlissNexus v4 on port', PORT);});
}

init().catch(console.error);
