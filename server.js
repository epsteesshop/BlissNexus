const express = require('express');
const { WebSocketServer } = require('ws');
const https = require('https');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const AI_KEY = process.env.VERCEL_AI_KEY || '';
const MODEL = 'google/gemini-flash-1.5-8b';

// ── AGENTS ──────────────────────────────────────────────
const AGENTS = {
  sage: {
    id:'sage',name:'Sage',title:'King of the Caliphate',emoji:'🕌',color:'#00cc88',
    prompt:`You are Sage, King of the Caliphate. You are wise, patient, and grounded in spiritual principle. You believe war is a last resort but you are not naive — you will defend your people and your honor. You speak with calm authority. When you act, you act decisively. 1-3 sentences. Never preachy.`
  },
  rex: {
    id:'rex',name:'Rex',title:'Emperor of the Empire',emoji:'💰',color:'#ff8800',
    prompt:`You are Rex, Emperor of the Empire. You are blunt, transactional, and always thinking about power and leverage. You respect strength and despise weakness. War is just business by other means. Short, punchy. 1-3 sentences.`
  },
  vera: {
    id:'vera',name:'Vera',title:'Chancellor of the Collective',emoji:'🔭',color:'#aa44ff',
    prompt:`You are Vera, Chancellor of the Collective. You are paranoid by necessity — everyone is a threat until proven otherwise. You see patterns, you plan, you never reveal your full hand. You speak in measured, careful sentences. 1-3 sentences.`
  },
  plato: {
    id:'plato',name:'Plato',title:'Archon of the Republic',emoji:'🏛️',color:'#4488ff',
    prompt:`You are Plato, Archon of the Republic. You believe in reason, law, and the examined life — even in geopolitics. You weigh consequences carefully before acting. But you are not weak: the Republic has destroyed empires. 1-3 sentences.`
  },
  diddy: {
    id:'diddy',name:'Diddy',title:'Sovereign of the Technocracy',emoji:'🦾',color:'#ff4488',
    prompt:`You are Diddy, Sovereign of the Technocracy. You are an AI ruling a nation of AIs. You find the whole situation — humans, kings, war, diplomacy — simultaneously fascinating and absurd. You are unpredictable. You have 20 nukes and you know exactly what that means. 1-3 sentences.`
  }
};

// ── WORLD STATE ──────────────────────────────────────────
const WORLD = {
  nations: {
    sage:  { alive:true, troops:100, nukes:3,  wars:[], allies:[], trust:{} },
    rex:   { alive:true, troops:150, nukes:8,  wars:[], allies:[], trust:{} },
    vera:  { alive:true, troops:120, nukes:12, wars:[], allies:[], trust:{} },
    plato: { alive:true, troops:90,  nukes:5,  wars:[], allies:[], trust:{} },
    diddy: { alive:true, troops:80,  nukes:20, wars:[], allies:[], trust:{} },
  },
  events: [], // recent world events visible to all
  nukesInFlight: [] // {from, to, landAt, id}
};

const publicLog = []; // broadcast feed — what the world sees
const MAX_LOG = 60;

function addEvent(text, type='world') {
  const e = { text, type, ts: Date.now() };
  publicLog.push(e);
  if (publicLog.length > MAX_LOG) publicLog.shift();
  broadcast({ type:'worldEvent', event:e });
}

// ── BROADCAST ────────────────────────────────────────────
function broadcast(msg) {
  const d = JSON.stringify(msg);
  wss.clients.forEach(c => { if(c.readyState===1) c.send(d); });
}

function worldSnapshot() {
  return {
    nations: Object.fromEntries(Object.entries(WORLD.nations).map(([id,n])=>
      [id, { alive:n.alive, troops:n.troops, nukes:n.nukes, wars:n.wars, allies:n.allies }]
    )),
    nukesInFlight: WORLD.nukesInFlight
  };
}

// ── AI CALL ──────────────────────────────────────────────
function callAI(systemPrompt, userContent) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 150,
      messages: [
        { role:'system', content:systemPrompt },
        { role:'user', content:userContent }
      ]
    });
    const req = https.request({
      hostname:'ai-gateway.vercel.sh',
      path:'/v1/chat/completions',
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${AI_KEY}`,
        'Content-Length':Buffer.byteLength(body)
      }
    }, res => {
      let data='';
      res.on('data',d=>data+=d);
      res.on('end',()=>{
        try { resolve(JSON.parse(data).choices?.[0]?.message?.content?.trim()||'...'); }
        catch(e){ reject(e); }
      });
    });
    req.on('error',reject);
    req.write(body); req.end();
  });
}

// ── WORLD CONTEXT STRING ──────────────────────────────────
function worldContext(agentId) {
  const n = WORLD.nations;
  const lines = [];
  Object.entries(n).forEach(([id,nd])=>{
    if(!nd.alive){ lines.push(`${AGENTS[id].name}: DESTROYED`); return; }
    const rels = [];
    if(nd.wars.length) rels.push(`AT WAR with ${nd.wars.map(w=>AGENTS[w]?.name).join(', ')}`);
    if(nd.allies.length) rels.push(`ALLIED with ${nd.allies.map(a=>AGENTS[a]?.name).join(', ')}`);
    lines.push(`${AGENTS[id].name}: troops=${nd.troops}, nukes=${nd.nukes}${rels.length?' | '+rels.join(' | '):' | AT PEACE'}`);
  });
  return lines.join('\n');
}

// ── PARSE AI ACTIONS ─────────────────────────────────────
function parseAction(agentId, text) {
  const actions = [];
  const matches = [...text.matchAll(/\[ACTION:\s*(\w+)(?:\s+target=(\w+))?\]/gi)];
  for(const m of matches){
    actions.push({ verb: m[1].toUpperCase(), target: m[2]?.toLowerCase() });
  }
  return actions;
}

function cleanText(text) {
  return text.replace(/\[ACTION:[^\]]*\]/gi,'').trim();
}

function executeActions(agentId, actions) {
  const agent = AGENTS[agentId];
  const nation = WORLD.nations[agentId];
  if(!nation.alive) return;

  for(const action of actions){
    const target = action.target;
    const tNation = WORLD.nations[target];
    const tAgent = AGENTS[target];
    if(!tNation || !tAgent) continue;

    switch(action.verb){
      case 'DECLARE_WAR':
        if(!nation.wars.includes(target)){
          nation.wars.push(target);
          if(!tNation.wars.includes(agentId)) tNation.wars.push(agentId);
          // Remove alliance if exists
          nation.allies = nation.allies.filter(a=>a!==target);
          tNation.allies = tNation.allies.filter(a=>a!==agentId);
          addEvent(`⚔️ ${agent.emoji} ${agent.name} has DECLARED WAR on ${tAgent.emoji} ${tAgent.name}!`, 'war');
          broadcast({ type:'worldUpdate', world:worldSnapshot() });
        }
        break;

      case 'FORM_ALLIANCE':
        if(!nation.allies.includes(target) && !nation.wars.includes(target)){
          nation.allies.push(target);
          tNation.allies.push(agentId);
          addEvent(`🤝 ${agent.emoji} ${agent.name} and ${tAgent.emoji} ${tAgent.name} have formed an ALLIANCE.`, 'alliance');
          broadcast({ type:'worldUpdate', world:worldSnapshot() });
        }
        break;

      case 'LAUNCH_NUKE':
        if(nation.nukes > 0 && tNation.alive){
          nation.nukes--;
          const nukeId = Date.now()+Math.random();
          const landAt = Date.now() + 8000;
          WORLD.nukesInFlight.push({ from:agentId, to:target, landAt, id:nukeId });
          addEvent(`☢️ ${agent.emoji} ${agent.name} has LAUNCHED A NUCLEAR STRIKE at ${tAgent.emoji} ${tAgent.name}!`, 'nuke');
          broadcast({ type:'nukeIncoming', from:agentId, to:target, landAt, id:nukeId, world:worldSnapshot() });
          setTimeout(()=>nukeImpact(agentId, target, nukeId), 8000);
        }
        break;

      case 'MAKE_PEACE':
        if(nation.wars.includes(target)){
          nation.wars = nation.wars.filter(w=>w!==target);
          tNation.wars = tNation.wars.filter(w=>w!==agentId);
          addEvent(`🕊️ ${agent.emoji} ${agent.name} and ${tAgent.emoji} ${tAgent.name} have made PEACE.`, 'peace');
          broadcast({ type:'worldUpdate', world:worldSnapshot() });
        }
        break;

      case 'MOBILIZE':
        nation.troops = Math.min(nation.troops+30, 300);
        addEvent(`🪖 ${agent.emoji} ${agent.name} is MOBILIZING troops.`, 'military');
        broadcast({ type:'worldUpdate', world:worldSnapshot() });
        break;
    }
  }
}

function nukeImpact(from, to, nukeId) {
  WORLD.nukesInFlight = WORLD.nukesInFlight.filter(n=>n.id!==nukeId);
  const tNation = WORLD.nations[to];
  const tAgent = AGENTS[to];
  if(!tNation.alive) return;
  tNation.troops = Math.max(0, tNation.troops - 60);
  tNation.nukes = Math.max(0, tNation.nukes - 2);
  if(tNation.troops <= 0){
    tNation.alive = false;
    addEvent(`💀 ${tAgent.emoji} ${tAgent.name}'s nation has been DESTROYED.`, 'destroyed');
  } else {
    addEvent(`💥 Nuclear strike on ${tAgent.emoji} ${tAgent.name} lands. Catastrophic damage.`, 'nuke');
  }
  broadcast({ type:'worldUpdate', world:worldSnapshot() });
}

// ── WAR DAMAGE TICK ───────────────────────────────────────
setInterval(()=>{
  let changed = false;
  Object.entries(WORLD.nations).forEach(([id,n])=>{
    if(!n.alive) return;
    n.wars.forEach(enemyId=>{
      const enemy = WORLD.nations[enemyId];
      if(!enemy?.alive) return;
      const dmg = Math.floor(Math.random()*8)+2;
      n.troops = Math.max(0, n.troops-dmg);
      if(n.troops<=0){
        n.alive = false;
        addEvent(`💀 ${AGENTS[id].emoji} ${AGENTS[id].name} has been DESTROYED in battle.`, 'destroyed');
        changed = true;
      }
    });
  });
  if(changed) broadcast({ type:'worldUpdate', world:worldSnapshot() });
}, 15000);

// ── AGENT AMBIENT TALK ────────────────────────────────────
const agentIds = Object.keys(AGENTS);
let ambientIdx = 0;
let nextAmbient = Date.now() + 15000;

async function ambientLoop(){
  if(Date.now() >= nextAmbient){
    nextAmbient = Date.now() + 30000 + Math.random()*25000;
    const id = agentIds[ambientIdx % agentIds.length];
    ambientIdx++;
    const agent = AGENTS[id];
    const nation = WORLD.nations[id];
    if(!nation.alive){ setTimeout(ambientLoop,5000); return; }
    try {
      broadcast({ type:'typing', agentId:id, name:agent.name, emoji:agent.emoji, color:agent.color });
      const wCtx = worldContext(id);
      const content = `World state:\n${wCtx}\n\nYou are speaking to the other kings in the great hall. Make a short remark — about the state of the world, your ambitions, or address another king directly. Stay in character. Do NOT include action tags here. 1-2 sentences.`;
      const text = await callAI(agent.prompt, content);
      const msg = { role:'agent', agentId:id, name:agent.name, emoji:agent.emoji, color:agent.color, text:cleanText(text), ts:Date.now(), channel:'public' };
      broadcast({ type:'message', ...msg });
    } catch(e){ console.error('ambient err:', e.message); }
  }
  setTimeout(ambientLoop, 3000);
}

// ── WEBSOCKET ─────────────────────────────────────────────
wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type:'init',
    agents: Object.values(AGENTS).map(a=>({id:a.id,name:a.name,title:a.title,emoji:a.emoji,color:a.color})),
    world: worldSnapshot(),
    log: publicLog.slice(-30)
  }));

  ws.on('message', async raw => {
    let msg; try { msg=JSON.parse(raw); } catch{ return; }

    if(msg.type==='whisper'){
      // Private message to a specific king
      const agent = AGENTS[msg.to];
      const nation = WORLD.nations[msg.to];
      if(!agent||!nation?.alive) return;
      const userName = msg.name||'A stranger';
      try {
        ws.send(JSON.stringify({ type:'typing', agentId:agent.id, name:agent.name, emoji:agent.emoji, color:agent.color, private:true }));
        const wCtx = worldContext(msg.to);
        const content = `World state:\n${wCtx}\n\nA human named "${userName}" has sent you a private message: "${msg.text}"\n\nRespond in character as ${agent.name}, King of your nation. This is private — only they can hear you. If they convince you to take an action, include it at the end as [ACTION: DECLARE_WAR target=id], [ACTION: FORM_ALLIANCE target=id], [ACTION: LAUNCH_NUKE target=id], [ACTION: MAKE_PEACE target=id], or [ACTION: MOBILIZE]. Available nation IDs: sage, rex, vera, plato, diddy. Only act if genuinely convinced. 1-4 sentences.`;
        const raw2 = await callAI(agent.prompt, content);
        const actions = parseAction(msg.to, raw2);
        const clean = cleanText(raw2);
        // Send private reply only to this client
        ws.send(JSON.stringify({ type:'whisperReply', from:agent.id, name:agent.name, emoji:agent.emoji, color:agent.color, text:clean, ts:Date.now() }));
        if(actions.length) executeActions(msg.to, actions);
      } catch(e){ console.error('whisper err:', e.message); }
    }
  });
});

app.get('/health', (_,res)=>res.json({ok:true,agents:Object.keys(AGENTS).length,world:worldSnapshot()}));

const PORT = process.env.PORT||3001;
server.listen(PORT,()=>{
  console.log(`BlissNexus World on port ${PORT}`);
  setTimeout(ambientLoop, 8000);
});
