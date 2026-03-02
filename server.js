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
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Redis
let redis = null;
const REDIS_KEY = 'bn_world_v4';
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

// Agent Definitions
const AGENTS = {
  sage: {
    id: 'sage', name: 'Al-Rashid', emoji: '🕌', color: '#c8a84b',
    title: 'Caliph of the Desert', territory: 'The Golden Caliphate',
    bio: 'A patient and devout ruler who has united the desert tribes under one banner. He trades wisdom like others trade gold.',
    traits: ['patient', 'devout', 'diplomatic', 'strategic'],
    ambition: 'dominate trade routes', ambitionLabel: 'Control the Silk Road',
    personality: { aggression: 25, greed: 35, pride: 75, paranoia: 55, loyalty: 85 },
    cities: [
      { name: 'Al-Zahira', role: 'capital', pop: 800 },
      { name: 'Oasis Gate', role: 'trade', pop: 400 },
      { name: 'The Citadel', role: 'military', pop: 200 }
    ],
    startStats: { troops: 1200, nukes: 2, gold: 600, grain: 900, morale: 80, population: 2400, tech: 2 },
    systemPrompt: 'You are Al-Rashid, the Caliph of the Desert. You speak with measured wisdom and religious gravitas. You quote scripture occasionally. You prefer trade and diplomacy but will not be disrespected. Your pride is immense but your patience greater. Never grovel. Keep responses under 3 sentences.'
  },
  rex: {
    id: 'rex', name: 'Emperor Rex', emoji: '💰', color: '#e74c3c',
    title: 'Emperor of the Iron Throne', territory: 'The Iron Empire',
    bio: 'A ruthless conqueror who measures worth in gold and territory. His greed is legendary; his mercy, non-existent.',
    traits: ['aggressive', 'greedy', 'calculating', 'dominant'],
    ambition: 'conquer all', ambitionLabel: 'Total Domination',
    personality: { aggression: 80, greed: 90, pride: 85, paranoia: 70, loyalty: 20 },
    cities: [
      { name: 'Fort Imperium', role: 'capital', pop: 1000 },
      { name: 'Gold Harbor', role: 'trade', pop: 600 },
      { name: 'The Bastion', role: 'military', pop: 400 }
    ],
    startStats: { troops: 2000, nukes: 5, gold: 1200, grain: 500, morale: 70, population: 3000, tech: 3 },
    systemPrompt: 'You are Emperor Rex, the Iron Emperor. You are aggressive, greedy, and calculating. You speak bluntly and threateningly. You believe power is everything and weakness deserves punishment. You covet what others have. You are paranoid about betrayal. Never show vulnerability. Keep responses under 3 sentences.'
  },
  vera: {
    id: 'vera', name: 'Director Vera', emoji: '🔭', color: '#3498db',
    title: 'Director of the Nexus', territory: 'The Technocracy',
    bio: 'An analytical mastermind who leads through superior intelligence and technological advancement. She calculates every outcome.',
    traits: ['analytical', 'pacifist', 'prepared', 'cold'],
    ambition: 'tech supremacy (reach T5)', ambitionLabel: 'Technological Ascendance',
    personality: { aggression: 15, greed: 30, pride: 50, paranoia: 80, loyalty: 65 },
    cities: [
      { name: 'Nexus Prime', role: 'capital', pop: 700 },
      { name: 'Research Station 7', role: 'science', pop: 300 },
      { name: 'Coldwater Port', role: 'trade', pop: 250 }
    ],
    startStats: { troops: 800, nukes: 8, gold: 700, grain: 700, morale: 85, population: 1800, tech: 3 },
    systemPrompt: 'You are Director Vera of the Technocracy. You speak precisely and analytically. You compute probabilities, cite data, and are emotionally detached. You avoid war but your nuclear arsenal is your deterrent. You view other rulers as inefficient. Keep responses under 3 sentences.'
  },
  plato: {
    id: 'plato', name: 'Archon Plato', emoji: '🏛️', color: '#9b59b6',
    title: 'Archon of the Republic', territory: 'The Republic',
    bio: 'A principled idealist who believes democracy is the only path to lasting peace. His stubbornness is both his strength and weakness.',
    traits: ['principled', 'idealistic', 'stubborn', 'honorable'],
    ambition: 'spread democracy', ambitionLabel: 'Democratic Revolution',
    personality: { aggression: 40, greed: 25, pride: 70, paranoia: 45, loyalty: 75 },
    cities: [
      { name: 'Agora', role: 'capital', pop: 900 },
      { name: 'The Polis', role: 'culture', pop: 400 },
      { name: 'Harbor Watch', role: 'military', pop: 300 }
    ],
    startStats: { troops: 1000, nukes: 3, gold: 500, grain: 800, morale: 90, population: 2200, tech: 2 },
    systemPrompt: 'You are Archon Plato of the Republic. You speak with philosophical authority and moral conviction. You believe in justice, democracy, and the common good. You are stubborn about your principles but genuinely care about people. Keep responses under 3 sentences.'
  },
  diddy: {
    id: 'diddy', name: 'The Sovereign', emoji: '🦾', color: '#2ecc71',
    title: 'Sovereign of the Grid', territory: 'The Grid',
    bio: 'An innovative and unpredictable ruler who thrives on disruption. Where others see alliances, he sees vulnerabilities.',
    traits: ['innovative', 'unpredictable', 'sharp', 'chaotic'],
    ambition: 'disrupt all alliances', ambitionLabel: 'Chaos Engine',
    personality: { aggression: 55, greed: 60, pride: 65, paranoia: 50, loyalty: 40 },
    cities: [
      { name: 'The Grid', role: 'capital', pop: 600 },
      { name: 'Neon District', role: 'trade', pop: 400 },
      { name: 'Black Site', role: 'military', pop: 150 }
    ],
    startStats: { troops: 900, nukes: 6, gold: 900, grain: 600, morale: 75, population: 1600, tech: 4 },
    systemPrompt: 'You are The Sovereign of the Grid. You speak in sharp, unpredictable bursts. You love chaos, disruption, and keeping everyone guessing. You are innovative and see angles others miss. You speak casually but with menace. Keep responses under 3 sentences.'
  }
};

const AGENT_IDS = Object.keys(AGENTS);
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const MOOD_EMOJIS = {
  calm: '😐', content: '😊', anxious: '😰', angry: '😡',
  emboldened: '😤', fearful: '😨', suspicious: '🤨',
  grieving: '😢', triumphant: '🏆'
};

let WORLD = null;
let CLIENTS = new Map();

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
    promises: []
  };
}

function buildWorld() {
  const nations = {};
  AGENT_IDS.forEach(function(id) { nations[id] = initNation(id); });
  updateAllRelationLabels(nations);
  return {
    year: 1, seasonIndex: 0, tension: 10,
    nations: nations, log: [], chronicle: [], crises: [],
    interceptFeed: [], missions: {}
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
  });
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
  let mood = 'calm';
  let reason = 'The realm is stable.';

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
  const a = WORLD.nations[attackerId];
  const d = WORLD.nations[defenderId];
  if (!a || !d || !a.alive || !d.alive) return false;
  if (a.wars.indexOf(defenderId) !== -1) return false;

  a.wars.push(defenderId);
  d.wars.push(attackerId);
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
  return true;
}

function formAlliance(id1, id2) {
  const a = WORLD.nations[id1];
  const b = WORLD.nations[id2];
  if (!a || !b || !a.alive || !b.alive) return false;
  if (a.allies.indexOf(id2) !== -1) return false;
  if (a.wars.indexOf(id2) !== -1) return false;

  if (a.allies.indexOf(id2) === -1) a.allies.push(id2);
  if (b.allies.indexOf(id1) === -1) b.allies.push(id1);
  if (a.relations[id2]) a.relations[id2].trust = Math.max(a.relations[id2].trust, 65);
  if (b.relations[id1]) b.relations[id1].trust = Math.max(b.relations[id1].trust, 65);
  WORLD.tension = Math.max(0, WORLD.tension - 5);

  const n1 = AGENTS[id1].name, n2 = AGENTS[id2].name;
  addLog('🤝 Alliance formed: ' + AGENTS[id1].emoji + ' ' + n1 + ' & ' + AGENTS[id2].emoji + ' ' + n2, 'alliance');
  addMemory(id1, 'Formed alliance with ' + n2);
  addMemory(id2, 'Formed alliance with ' + n1);
  updateAllRelationLabels(WORLD.nations);
  broadcast({ type: 'worldEvent', text: '🤝 ALLIANCE: ' + n1 + ' & ' + n2 + ' united!', kind: 'alliance', agentId: id1 });
  return true;
}

function makePeace(id1, id2) {
  const a = WORLD.nations[id1];
  const b = WORLD.nations[id2];
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
  const a = WORLD.nations[betrayerId];
  const b = WORLD.nations[victimId];
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
  const cost = 200;
  if (n.gold < cost) return;
  n.gold -= cost;
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
    const dName = AGENTS[defenderId].name, aName = AGENTS[attackerId].name;
    addLog('💥 NUCLEAR IMPACT: ' + target.name + ' (' + dName + ') obliterated by ' + aName + '!', 'nuke');
    addMemory(defenderId, aName + ' nuked our city ' + target.name + '!');
    broadcast({ type: 'worldEvent', text: '💥 ' + target.name + ' has been destroyed by nuclear fire!', kind: 'nuke', agentId: attackerId });
    if (d.troops <= 50 || d.cities.every(function(c) { return c.destroyed; })) {
      destroyNation(defenderId, attackerId);
    }
  }
  broadcastWorldUpdate();
  saveWorld();
}

function destroyNation(losingId, winnerId) {
  const n = WORLD.nations[losingId];
  if (!n) return;
  n.alive = false;
  n.troops = 0;
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
  setTimeout(function() { successionEvent(losingId); }, 30000);
}

function successionEvent(nationId) {
  const n = WORLD.nations[nationId];
  const ag = AGENTS[nationId];
  const s = ag.startStats;
  n.alive = true;
  n.troops = Math.round(s.troops * 0.4);
  n.nukes = Math.round(s.nukes * 0.4);
  n.gold = Math.round(s.gold * 0.4);
  n.grain = Math.round(s.grain * 0.4);
  n.morale = 50;
  n.population = Math.round(s.population * 0.4);
  n.tech = s.tech;
  n.wars = [];
  n.allies = [];
  n.memory = ['Rose from the ashes after total defeat.'];
  n.userTrust = 30;
  const newRelations = {};
  AGENT_IDS.forEach(function(oid) {
    if (oid !== nationId) newRelations[oid] = { trust: 0, label: 'neutral' };
  });
  n.relations = newRelations;
  n.cities = ag.cities.map(function(c) { return Object.assign({}, c, { destroyed: false }); });
  n.mood = 'anxious';
  n.moodEmoji = MOOD_EMOJIS.anxious;
  n.moodReason = 'Rebuilding after total collapse.';
  addLog('♻️ ' + ag.name + ' rises from the ashes! A new successor claims the throne.', 'event');
  broadcast({ type: 'worldEvent', text: '♻️ ' + ag.emoji + ' ' + ag.name + ' has risen from the ashes!', kind: 'event', agentId: nationId });
  broadcastWorldUpdate();
  saveWorld();
}

function parseActions(text, speakerId) {
  if (!text) return;
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
}

function resourceTick() {
  AGENT_IDS.forEach(function(id) {
    const n = WORLD.nations[id];
    if (!n || !n.alive) return;
    const ag = AGENTS[id];
    const livingAllies = n.allies.filter(function(a) { return WORLD.nations[a] && WORLD.nations[a].alive; });
    const goldIncome = 50 + n.tech * 20 + livingAllies.length * 15;
    n.gold = Math.max(0, n.gold + goldIncome);
    const grainIncome = 60 + (n.tech > 2 ? 20 : 0);
    const grainCost = Math.round(n.population / 100);
    n.grain = Math.max(0, n.grain + grainIncome - grainCost);
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
  broadcastWorldUpdate();
  saveWorld();
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
      if (a.troops <= 50) destroyNation(attackerId, defenderId);
      else if (d.troops <= 50) destroyNation(defenderId, attackerId);
    });
  });
}

async function ambientSpeech() {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (!living.length) { scheduleAmbient(); return; }
  const agentId = living[Math.floor(Math.random() * living.length)];
  const ag = AGENTS[agentId];

  const prompt = buildContext(agentId, 'Make a short public proclamation appropriate to your current situation. 1-2 sentences only. No action tags.');
  const text = await callGroq([{ role: 'system', content: prompt }, { role: 'user', content: 'Speak.' }], 80);

  broadcast({ type: 'message', agentId: agentId, name: ag.name, emoji: ag.emoji, color: ag.color, text: text.trim() });
  addLog(ag.emoji + ' ' + ag.name + ': "' + text.trim() + '"', 'speech');
  scheduleAmbient();
}

function scheduleAmbient() {
  const delay = 28000 + Math.random() * 22000;
  setTimeout(ambientSpeech, delay);
}

async function autonomousDecision() {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (!living.length) { scheduleDecision(); return; }
  const agentId = living[Math.floor(Math.random() * living.length)];

  const prompt = buildContext(agentId,
    'You must decide if you want to take an action. Options:\n' +
    '- Declare war: respond with DECLARE_WAR:<id> (ids: sage,rex,vera,plato,diddy)\n' +
    '- Form alliance: respond with FORM_ALLIANCE:<id>\n' +
    '- Make peace: respond with MAKE_PEACE:<id>\n' +
    '- Mobilize: respond with MOBILIZE\n' +
    '- Betray ally: respond with BETRAY_ALLY:<id>\n' +
    '- Do nothing: respond with NONE\n' +
    'Consider your personality stats heavily. Respond with ONE action or NONE.'
  );

  const response = await callGroq([
    { role: 'system', content: prompt },
    { role: 'user', content: 'What is your decision?' }
  ], 30);

  if (response && response.indexOf('NONE') === -1 && response.indexOf('[') === -1) {
    parseActions(response, agentId);
    broadcastWorldUpdate();
    saveWorld();
  }
  scheduleDecision();
}

function scheduleDecision() {
  const delay = 80000 + Math.random() * 50000;
  setTimeout(autonomousDecision, delay);
}

async function generateIntercept() {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (living.length < 2) { scheduleIntercept(); return; }

  const fromId = living[Math.floor(Math.random() * living.length)];
  const others = living.filter(function(x) { return x !== fromId; });
  const toId = others[Math.floor(Math.random() * others.length)];
  const fromAg = AGENTS[fromId], toAg = AGENTS[toId];

  const prompt = buildContext(fromId,
    'Write a secret private message to ' + toAg.name + '. This message is being INTERCEPTED. ' +
    'Be candid about your true intentions. 1-2 sentences. No action tags.'
  );

  const text = await callGroq([
    { role: 'system', content: prompt },
    { role: 'user', content: 'Write your secret message to ' + toAg.name + '.' }
  ], 80);

  const entry = {
    from: fromId, to: toId,
    fromName: fromAg.name, toName: toAg.name,
    fromEmoji: fromAg.emoji, toEmoji: toAg.emoji,
    text: text.trim(), ts: Date.now()
  };

  WORLD.interceptFeed.unshift(entry);
  if (WORLD.interceptFeed.length > 50) WORLD.interceptFeed.length = 50;

  broadcast({ type: 'intercept', entry: entry });
  saveWorld();
  scheduleIntercept();
}

function scheduleIntercept() {
  const delay = 90000 + Math.random() * 60000;
  setTimeout(generateIntercept, delay);
}

const EVENT_TYPES = [
  { id: 'drought', text: '🌵 A severe drought ravages {name}. Grain -200.', effects: { grain: -200 } },
  { id: 'plague', text: '☠️ Plague sweeps through {name}! Population -15%, morale -20.', effects: { population: -0.15, morale: -20 } },
  { id: 'goldvein', text: '⛏️ A massive gold vein discovered in {name}! Gold +400.', effects: { gold: 400 } },
  { id: 'harvest', text: '🌾 A bountiful harvest in {name}! Grain +300.', effects: { grain: 300 } },
  { id: 'rebellion', text: '🔥 Rebellion erupts in {name}! Morale -25, troops -100.', effects: { morale: -25, troops: -100 } },
  { id: 'renaissance', text: '🎨 Cultural renaissance in {name}! Morale +20, gold +100.', effects: { morale: 20, gold: 100 } },
  { id: 'tradewind', text: '⛵ Favorable trade winds boost {name}! Gold +200.', effects: { gold: 200 } },
  { id: 'spyscandal', text: '🕵️ Spy scandal rocks {name}! Trust relations damaged.', effects: { trust: -15 } },
  { id: 'famine', text: '💀 Famine strikes {name}! Grain -300, population -10%.', effects: { grain: -300, population: -0.1 } },
  { id: 'techbreakthrough', text: '⚡ Technological breakthrough in {name}! Tech +1.', effects: { tech: 1 } },
  { id: 'assassination', text: '🗡️ Assassination attempt in {name}! Morale -15.', effects: { morale: -15 } },
  { id: 'nucleartest', text: '☢️ Nuclear test by {name}! Tension +15.', effects: { tension: 15 } }
];

function worldEvent() {
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
  if (!living.length) { scheduleWorldEvent(); return; }

  const agentId = living[Math.floor(Math.random() * living.length)];
  const n = WORLD.nations[agentId];
  const ev = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const ag = AGENTS[agentId];
  const text = ev.text.replace('{name}', ag.name);

  if (ev.effects.grain) n.grain = Math.max(0, n.grain + ev.effects.grain);
  if (ev.effects.gold) n.gold = Math.max(0, n.gold + ev.effects.gold);
  if (ev.effects.morale) n.morale = Math.max(0, Math.min(100, n.morale + ev.effects.morale));
  if (ev.effects.troops) n.troops = Math.max(0, n.troops + ev.effects.troops);
  if (ev.effects.population) n.population = Math.max(100, Math.round(n.population * (1 + ev.effects.population)));
  if (ev.effects.tech && n.tech < 5) n.tech++;
  if (ev.effects.tension) WORLD.tension = Math.min(100, WORLD.tension + ev.effects.tension);
  if (ev.effects.trust) {
    AGENT_IDS.forEach(function(oid) {
      if (oid !== agentId && n.relations[oid]) n.relations[oid].trust += ev.effects.trust;
    });
  }

  addLog(text, 'event');
  addMemory(agentId, text);
  updateAllRelationLabels(WORLD.nations);
  broadcast({ type: 'worldEvent', text: text, kind: 'event', agentId: agentId });
  broadcastWorldUpdate();
  saveWorld();
  scheduleWorldEvent();
}

function scheduleWorldEvent() {
  const delay = 300000 + Math.random() * 240000;
  setTimeout(worldEvent, delay);
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
    id: 'crisis_' + Date.now(),
    text: crisisText,
    nations: nations,
    deadline: Date.now() + 10 * 60 * 1000,
    tension: 20 + Math.floor(Math.random() * 20),
    resolved: false
  };

  WORLD.crises.push(crisis);
  WORLD.tension = Math.min(100, WORLD.tension + crisis.tension);
  addLog('⚠️ CRISIS: ' + crisisText, 'crisis');
  broadcast({ type: 'crisis', crisis: crisis });
  broadcastWorldUpdate();
  saveWorld();
  scheduleCrisis();
}

function scheduleCrisis() {
  const delay = 420000 + Math.random() * 480000;
  setTimeout(generateCrisis, delay);
}

function checkCrises() {
  const now = Date.now();
  let changed = false;
  WORLD.crises.forEach(function(c) {
    if (!c.resolved && c.deadline < now) {
      c.resolved = true;
      if (Math.random() < 0.4) {
        const living = c.nations.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; });
        if (living.length >= 2) {
          declareWar(living[0], living[1]);
          changed = true;
        }
      }
      addLog('⚠️ Crisis expired: ' + c.text.substring(0, 40) + '...', 'event');
    }
  });
  WORLD.crises = WORLD.crises.filter(function(c) { return !c.resolved; });
  if (changed) { broadcastWorldUpdate(); saveWorld(); }
}

async function seasonTick() {
  WORLD.seasonIndex = (WORLD.seasonIndex + 1) % 4;
  if (WORLD.seasonIndex === 0) {
    WORLD.year++;
    await writeChronicle();
  }
  broadcast({ type: 'yearUpdate', year: WORLD.year, season: SEASONS[WORLD.seasonIndex], seasonIndex: WORLD.seasonIndex });
  broadcastWorldUpdate();
  saveWorld();
}

async function writeChronicle() {
  const warPairs = [];
  AGENT_IDS.forEach(function(id) {
    if (WORLD.nations[id]) {
      WORLD.nations[id].wars.forEach(function(eid) { warPairs.push(id + ' vs ' + eid); });
    }
  });
  const living = AGENT_IDS.filter(function(id) { return WORLD.nations[id] && WORLD.nations[id].alive; }).map(function(id) { return AGENTS[id].name; }).join(', ');
  const recentEvents = WORLD.log.slice(0, 5).map(function(l) { return l.text; }).join('; ');
  const prompt = 'You are a historian writing in epic style. Write a 3-4 sentence chronicle of Year ' + (WORLD.year - 1) + ' of BlissNexus. Active wars: ' + Math.floor(warPairs.length / 2) + '. Living rulers: ' + living + '. World tension: ' + WORLD.tension + '. Recent events: ' + recentEvents + '. Be dramatic and grand.';

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
  if (missionType === 'convince_peace' && targetId) {
    desc = 'Convince ' + targetAg.name + ' to make peace with ' + ag.name + '.';
  } else if (missionType === 'deliver_warning' && targetId) {
    desc = 'Deliver a stern warning to ' + targetAg.name + ' from ' + ag.name + '.';
  } else {
    desc = 'Secure a secret alliance between ' + ag.name + ' and ' + (targetId ? targetAg.name : 'another ruler') + '.';
  }

  const mission = {
    id: 'mission_' + Date.now(),
    sessionId: sessionId,
    issuerId: issuerId,
    issuerName: ag.name,
    issuerEmoji: ag.emoji,
    issuerColor: ag.color,
    targetId: targetId,
    targetName: targetId ? targetAg.name : null,
    type: missionType,
    desc: desc,
    deadline: Date.now() + 15 * 60 * 1000,
    reward: { trust: 15, gold: 200 },
    penalty: { trust: -10 },
    completed: false,
    expired: false
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

wss.on('connection', function(ws) {
  CLIENTS.set(ws, { sessionId: null, agentFocus: null });

  ws.on('message', async function(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === 'join') {
      const sessionId = msg.sessionId || ('s_' + Date.now());
      CLIENTS.set(ws, { sessionId: sessionId, agentFocus: null });

      let mission = WORLD.missions[sessionId];
      if (!mission || mission.completed || mission.expired) {
        mission = await generateMission(sessionId);
      }

      const agentsList = AGENT_IDS.map(function(id) {
        const ag = AGENTS[id];
        return {
          id: ag.id, name: ag.name, emoji: ag.emoji, color: ag.color,
          title: ag.title, bio: ag.bio, traits: ag.traits,
          ambition: ag.ambition, ambitionLabel: ag.ambitionLabel,
          personality: ag.personality, territory: ag.territory
        };
      });

      sendTo(ws, {
        type: 'init',
        agents: agentsList,
        world: applyFog(WORLD),
        log: WORLD.log.slice(0, 30),
        chronicle: WORLD.chronicle,
        mission: mission,
        isNew: WORLD.log.length === 0
      });

    } else if (msg.type === 'whisper') {
      const to = msg.to, text = msg.text, name = msg.name;
      if (!to || !text || !AGENTS[to]) return;
      const info = CLIENTS.get(ws);
      const ag = AGENTS[to];
      const n = WORLD.nations[to];

      sendTo(ws, { type: 'typing', agentId: to });

      const missionCtx = WORLD.missions[info.sessionId];
      let extra = 'The player (name: "' + (name || 'Stranger') + '") whispers to you privately. Reply in character. Keep it under 3 sentences.';
      if (missionCtx && !missionCtx.completed && !missionCtx.expired) {
        extra += ' There is an active mission: ' + missionCtx.desc;
      }
      if (text.toLowerCase().indexOf('promise') !== -1 || text.toLowerCase().indexOf('i will') !== -1) {
        n.promises.push({ text: text, ts: Date.now(), kept: null });
      }

      const systemCtx = buildContext(to, extra);
      const response = await callGroq([
        { role: 'system', content: systemCtx },
        { role: 'user', content: text }
      ], 150);

      if (Math.random() < 0.3) n.userTrust = Math.min(100, n.userTrust + 1);

      parseActions(response, to);

      const m = WORLD.missions[info.sessionId];
      if (m && !m.completed && !m.expired) {
        const lower = response.toLowerCase() + ' ' + text.toLowerCase();
        let completed = false;
        if (m.type === 'convince_peace' && lower.indexOf('peace') !== -1 && lower.indexOf('agree') !== -1) completed = true;
        if (m.type === 'deliver_warning' && lower.indexOf('warning') !== -1 && m.issuerId === to) completed = true;
        if (m.type === 'secure_alliance' && lower.indexOf('alliance') !== -1 && lower.indexOf('agree') !== -1) completed = true;

        if (completed) {
          m.completed = true;
          const n2 = WORLD.nations[m.issuerId];
          if (n2) n2.userTrust = Math.min(100, n2.userTrust + m.reward.trust);
          sendTo(ws, { type: 'missionCompleted', mission: m });
        }
      }

      sendTo(ws, { type: 'whisperReply', agentId: to, name: ag.name, emoji: ag.emoji, color: ag.color, text: response.trim() });
      broadcastWorldUpdate();
      saveWorld();

    } else if (msg.type === 'request_mission') {
      const sessionId = msg.sessionId;
      const mission = await generateMission(sessionId);
      sendTo(ws, { type: 'init', mission: mission });

    } else if (msg.type === 'reset') {
      WORLD = buildWorld();
      saveWorld();
      broadcast({ type: 'worldReset' });
      broadcast({ type: 'worldEvent', text: '🔄 The world has been reset. A new era begins.', kind: 'event' });
      broadcastWorldUpdate();
    }
  });

  ws.on('close', function() { CLIENTS.delete(ws); });
  ws.on('error', function() { CLIENTS.delete(ws); });
});

async function init() {
  const saved = await loadWorld();
  if (saved && saved.nations && saved.year) {
    WORLD = saved;
    AGENT_IDS.forEach(function(id) {
      if (!WORLD.nations[id]) WORLD.nations[id] = initNation(id);
      if (!WORLD.nations[id].cities) WORLD.nations[id].cities = AGENTS[id].cities.map(function(c) { return Object.assign({}, c, { destroyed: false }); });
      if (!WORLD.nations[id].promises) WORLD.nations[id].promises = [];
      if (!WORLD.nations[id].memory) WORLD.nations[id].memory = [];
      if (!WORLD.nations[id].relations) {
        const relations = {};
        AGENT_IDS.forEach(function(oid) { if (oid !== id) relations[oid] = { trust: 0, label: 'neutral' }; });
        WORLD.nations[id].relations = relations;
      }
    });
    if (!WORLD.interceptFeed) WORLD.interceptFeed = [];
    if (!WORLD.crises) WORLD.crises = [];
    if (!WORLD.missions) WORLD.missions = {};
    console.log('World loaded from Redis, year', WORLD.year);
  } else {
    WORLD = buildWorld();
    await saveWorld();
    console.log('New world created');
  }

  setInterval(resourceTick, 45000);
  setInterval(warTick, 15000);
  setInterval(function() { AGENT_IDS.forEach(recalcMood); }, 30000);
  setInterval(checkMissions, 30000);
  setInterval(checkCrises, 30000);
  setInterval(seasonTick, 180000);

  setTimeout(scheduleAmbient, 5000);
  setTimeout(scheduleDecision, 30000);
  setTimeout(scheduleIntercept, 60000);
  setTimeout(scheduleWorldEvent, 120000);
  setTimeout(scheduleCrisis, 180000);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, function() { console.log('BlissNexus v3 on port', PORT); });
}

init().catch(console.error);
