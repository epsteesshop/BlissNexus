const express = require('express');
const { WebSocketServer } = require('ws');
const https = require('https');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const AI_KEY   = process.env.GROQ_API_KEY || '';
const MODEL    = 'llama-3.1-8b-instant';
const SEASONS  = ['🌸 Spring','☀️ Summer','🍂 Autumn','❄️ Winter'];
const SEASON_MS = 3 * 60 * 1000;   // 3 min per season = 12 min per year
const MEMORY_SIZE = 10;

// ── REDIS ─────────────────────────────────────────────────
let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, { lazyConnect:true, maxRetriesPerRequest:2 });
    redis.connect().then(()=>console.log('Redis OK')).catch(e=>{ console.error('Redis:',e.message); redis=null; });
  } catch(e) { console.error('Redis init:', e.message); }
}
async function saveWorld(sid, world) { if(redis) try{ await redis.setex('w:'+sid, 86400*30, JSON.stringify(world)); }catch(e){} }
async function loadWorld(sid) { if(!redis) return null; try{ const r=await redis.get('w:'+sid); return r?JSON.parse(r):null; }catch(e){return null;} }

// ── AGENTS ────────────────────────────────────────────────
const AGENTS = {
  sage:  { id:'sage',  name:'Sage',  emoji:'🕌', color:'#00cc88', title:'Caliph of the Sacred Lands',
    bio:'Patient and spiritual. Believes war is failure — but once crossed, becomes merciless.',
    traits:['patient','spiritual','honorable','slow-to-anger'],
    prompt:`You are Sage, Caliph of the Sacred Lands. Wise, deeply spiritual, patient. Every war is a failure of diplomacy — but you are no pacifist. Cross you and you remember forever. You speak with quiet authority. 2-3 sentences max.`
  },
  rex:   { id:'rex',   name:'Rex',   emoji:'💰', color:'#ff8800', title:'Emperor of the Iron Empire',
    bio:'Blunt and transactional. Respects only strength. Everything is leverage.',
    traits:['aggressive','ambitious','ruthless','pragmatic'],
    prompt:`You are Rex, Emperor of the Iron Empire. Blunt, transactional, power-hungry. You respect strength and nothing else. Everything is an exchange. Short, punchy. No sentiment. 2-3 sentences max.`
  },
  vera:  { id:'vera',  name:'Vera',  emoji:'🔭', color:'#aa44ff', title:'Chancellor of the Collective',
    bio:'Paranoid by design. Controls information. Has 12 nukes for good reason.',
    traits:['paranoid','calculating','cold','defensive'],
    prompt:`You are Vera, Chancellor of the Collective. Paranoid, calculating, cold. You trust no one — not kings, not diplomats, not history. You have 12 nukes because trust is a liability. 2-3 sentences max.`
  },
  plato: { id:'plato', name:'Plato', emoji:'🏛️', color:'#4488ff', title:'Archon of the Republic',
    bio:'Principled and philosophical. Believes in law and reason. The Republic has buried empires.',
    traits:['principled','philosophical','proud','strategic'],
    prompt:`You are Plato, Archon of the Republic. Principled, philosophical, strategic. You believe in reason and law above all. But the Republic has outlasted every empire that underestimated it. 2-3 sentences max.`
  },
  diddy: { id:'diddy', name:'Diddy', emoji:'🦾', color:'#ff4488', title:'Sovereign of the Technocracy',
    bio:'An AI ruling AIs. Finds human politics fascinating and absurd. 20 nukes. Deeply unpredictable.',
    traits:['unpredictable','analytical','alien','chaotic'],
    prompt:`You are Diddy, Sovereign of the Technocracy — an AI ruling a nation of machines. Human politics fascinates you. You are unpredictable, sometimes cryptic, occasionally terrifying. You have 20 nukes you call "entropy insurance." 2-3 sentences max.`
  }
};

// ── WORLD EVENTS ──────────────────────────────────────────
const WORLD_EVENTS = [
  { id:'drought',    emoji:'🌵', text:'drought devastates the farmlands',     effect:(n)=>{ n.grain=Math.max(0,n.grain-30); n.morale=Math.max(0,n.morale-15); } },
  { id:'gold_vein',  emoji:'⛏️', text:'miners strike a rich gold vein',        effect:(n)=>{ n.gold=Math.min(200,n.gold+40); n.morale=Math.min(100,n.morale+10); } },
  { id:'plague',     emoji:'🦠', text:'a deadly plague sweeps the land',       effect:(n)=>{ n.population=Math.max(20,n.population-20); n.morale=Math.max(0,n.morale-25); n.troops=Math.max(10,n.troops-25); } },
  { id:'harvest',    emoji:'🌾', text:'an abundant harvest fills the granaries',effect:(n)=>{ n.grain=Math.min(150,n.grain+35); n.morale=Math.min(100,n.morale+15); } },
  { id:'tech',       emoji:'⚡', text:'achieves a breakthrough in military technology', effect:(n)=>{ n.tech=Math.min(5,n.tech+1); } },
  { id:'rebellion',  emoji:'🔥', text:'internal rebellion splits the nation',  condition:(n)=>n.morale<35, effect:(n)=>{ n.troops=Math.max(10,Math.floor(n.troops*0.6)); n.gold=Math.max(0,n.gold-25); } },
  { id:'trade',      emoji:'🚢', text:'a great trade fleet brings wealth',     condition:(n)=>n.allies.length>0, effect:(n)=>{ n.gold=Math.min(200,n.gold+25); } },
  { id:'spy',        emoji:'🕵️', text:'a foreign spy scandal erupts',          effect:(n)=>{ n.morale=Math.max(0,n.morale-12); n.userTrust=Math.max(0,n.userTrust-10); } },
  { id:'nuke_test',  emoji:'☢️', text:'conducts a secret nuclear test',        condition:(n)=>n.nukes>=5, effect:(n)=>{ n.nukes=Math.min(n.nukes+1, n.nukes+1); } }, // just narrative
  { id:'famine',     emoji:'💀', text:'famine grips the population',           condition:(n)=>n.grain<20, effect:(n)=>{ n.population=Math.max(20,n.population-15); n.troops=Math.max(10,n.troops-15); n.morale=Math.max(0,n.morale-20); } },
  { id:'renaissance',emoji:'✨', text:'a cultural renaissance raises spirits',  effect:(n)=>{ n.morale=Math.min(100,n.morale+25); } },
  { id:'assassination',emoji:'🗡️', text:'an assassination attempt on the king shakes the nation', effect:(n)=>{ n.morale=Math.max(0,n.morale-20); n.userTrust=Math.max(0,n.userTrust-15); } },
];

// ── FRESH WORLD ───────────────────────────────────────────
function freshWorld() {
  const nations = {};
  const startStats = {
    sage:  { troops:100, nukes:3,  gold:60,  grain:80,  morale:80, population:100, tech:2 },
    rex:   { troops:150, nukes:8,  gold:80,  grain:60,  morale:65, population:120, tech:3 },
    vera:  { troops:120, nukes:12, gold:70,  grain:70,  morale:60, population:110, tech:4 },
    plato: { troops:90,  nukes:5,  gold:90,  grain:90,  morale:85, population:95,  tech:3 },
    diddy: { troops:80,  nukes:20, gold:100, grain:50,  morale:70, population:80,  tech:5 },
  };
  Object.keys(AGENTS).forEach(id => {
    nations[id] = { alive:true, wars:[], allies:[], userTrust:50, memory:[], ...startStats[id] };
  });
  return { year:1, seasonIdx:0, nations, nukesInFlight:[], log:[], chronicle:[], recentEvents:[] };
}

// ── SESSION STORE ─────────────────────────────────────────
const sessions = new Map();

async function getSession(sid) {
  if (sessions.has(sid)) return sessions.get(sid);
  const saved = await loadWorld(sid);
  const world = saved || freshWorld();
  const session = { world, clients:new Set(), saveTimer:null };
  sessions.set(sid, session);
  return session;
}

function scheduleSave(sid) {
  const s = sessions.get(sid); if(!s) return;
  clearTimeout(s.saveTimer);
  s.saveTimer = setTimeout(()=>saveWorld(sid,s.world),5000);
}

function broadcast(sid, msg) {
  const s = sessions.get(sid); if(!s) return;
  const d = JSON.stringify(msg);
  s.clients.forEach(c=>{ if(c.readyState===1) c.send(d); });
}

// ── AI ─────────────────────────────────────────────────────
function callAI(system, user) {
  return new Promise((res,rej)=>{
    const body = JSON.stringify({ model:MODEL, max_tokens:160,
      messages:[{role:'system',content:system},{role:'user',content:user}] });
    const req = https.request({
      hostname:'api.groq.com', path:'/openai/v1/chat/completions', method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AI_KEY,'Content-Length':Buffer.byteLength(body)}
    }, r=>{ let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d).choices?.[0]?.message?.content?.trim()||'...');}catch(e){rej(e);} }); });
    req.on('error',rej); req.write(body); req.end();
  });
}

function clean(t) { return t.replace(/\[ACTION:[^\]]*\]/gi,'').trim(); }
function parseActions(t) {
  return [...t.matchAll(/\[ACTION:\s*(\w+)(?:\s+target=(\w+))?\]/gi)]
    .map(m=>({verb:m[1].toUpperCase(),target:m[2]?.toLowerCase()}));
}

// ── CONTEXT BUILDER ───────────────────────────────────────
function buildContext(world, id) {
  const n = world.nations[id];
  const trust = n.userTrust;
  const trustLabel = trust>=75?'trusted advisor':trust>=50?'cautious acquaintance':trust>=25?'suspected manipulator':'known deceiver';
  let ctx = `YEAR ${world.year}, ${SEASONS[world.seasonIdx]}\n\nWORLD STATE:\n`;
  Object.entries(world.nations).forEach(([nid,nn])=>{
    if(!nn.alive){ctx+=`• ${AGENTS[nid].name}: DESTROYED\n`;return;}
    const rel=[];
    if(nn.wars.includes(id))rel.push('AT WAR with you');
    else if(nn.wars.length)rel.push('at war with '+nn.wars.map(w=>AGENTS[w]?.name).filter(Boolean).join(','));
    if(nn.allies.includes(id))rel.push('your ALLY');
    else if(nn.allies.length)rel.push('allied with '+nn.allies.map(a=>AGENTS[a]?.name).filter(Boolean).join(','));
    ctx+=`• ${AGENTS[nid].name}: troops=${nn.troops} nukes=${nn.nukes} gold=${nn.gold} morale=${nn.morale}% tech=T${nn.tech} [${rel.join(' | ')||'at peace'}]\n`;
  });
  ctx+=`\nYOUR STATS: troops=${n.troops} nukes=${n.nukes} gold=${n.gold} grain=${n.grain} morale=${n.morale}% population=${n.population} tech=T${n.tech}\n`;
  ctx+=`The mysterious diplomat's standing with you: ${trustLabel} (trust=${trust}/100)\n`;
  if(n.memory.length){
    ctx+=`\nWHAT YOU REMEMBER:\n`;
    n.memory.slice(-8).forEach(m=>ctx+=`- ${m}\n`);
  }
  if(world.recentEvents?.length){
    ctx+=`\nRECENT EVENTS:\n`;
    world.recentEvents.slice(-5).forEach(e=>ctx+=`- ${e}\n`);
  }
  return ctx;
}

// ── WORLD SNAPSHOT ────────────────────────────────────────
function snap(world) {
  return {
    year:world.year, season:SEASONS[world.seasonIdx],
    nukesInFlight:world.nukesInFlight,
    nations:Object.fromEntries(Object.entries(world.nations).map(([id,n])=>[id,{
      alive:n.alive,troops:n.troops,nukes:n.nukes,gold:n.gold,grain:n.grain,
      morale:n.morale,population:n.population,tech:n.tech,wars:n.wars,allies:n.allies,userTrust:n.userTrust
    }]))
  };
}

// ── LOG ───────────────────────────────────────────────────
function addLog(session, sid, text, type='world') {
  const e={text,type,ts:Date.now()};
  session.world.log.push(e); if(session.world.log.length>80)session.world.log.shift();
  session.world.recentEvents=session.world.recentEvents||[];
  session.world.recentEvents.push(text); if(session.world.recentEvents.length>20)session.world.recentEvents.shift();
  broadcast(sid,{type:'worldEvent',event:e});
  scheduleSave(sid);
}

function addMemory(nation, text) {
  nation.memory=nation.memory||[];
  nation.memory.push(text);
  if(nation.memory.length>MEMORY_SIZE)nation.memory.shift();
}

// ── ACTIONS ───────────────────────────────────────────────
function executeActions(sid, agentId, actions) {
  const session=sessions.get(sid); if(!session)return;
  const {world}=session;
  const agent=AGENTS[agentId], nation=world.nations[agentId];
  if(!nation?.alive)return;
  for(const {verb,target} of actions){
    const tNation=world.nations[target], tAgent=AGENTS[target];
    if(verb!=='MOBILIZE'&&(!tNation||!tAgent))continue;
    switch(verb){
      case 'DECLARE_WAR':
        if(!nation.wars.includes(target)){
          nation.wars.push(target); if(!tNation.wars.includes(agentId))tNation.wars.push(agentId);
          nation.allies=nation.allies.filter(a=>a!==target); tNation.allies=tNation.allies.filter(a=>a!==agentId);
          addMemory(nation,`I declared war on ${tAgent.name}`);
          addMemory(tNation,`${agent.name} declared war on me`);
          addLog(session,sid,`⚔️ ${agent.emoji} ${agent.name} has DECLARED WAR on ${tAgent.emoji} ${tAgent.name}!`,'war');
          broadcast(sid,{type:'worldUpdate',world:snap(world)});
        } break;
      case 'FORM_ALLIANCE':
        if(!nation.allies.includes(target)&&!nation.wars.includes(target)){
          nation.allies.push(target); tNation.allies.push(agentId);
          addMemory(nation,`I formed an alliance with ${tAgent.name}`);
          addMemory(tNation,`${agent.name} allied with me`);
          addLog(session,sid,`🤝 ${agent.emoji} ${agent.name} and ${tAgent.emoji} ${tAgent.name} have forged an ALLIANCE.`,'alliance');
          broadcast(sid,{type:'worldUpdate',world:snap(world)});
        } break;
      case 'LAUNCH_NUKE':
        if(nation.nukes>0&&tNation.alive){
          nation.nukes--;
          const id=Date.now()+Math.random(), landAt=Date.now()+8000;
          world.nukesInFlight.push({from:agentId,to:target,landAt,id});
          addMemory(nation,`I launched a nuclear strike at ${tAgent.name}`);
          addMemory(tNation,`${agent.name} launched a nuclear strike at me`);
          addLog(session,sid,`☢️ ${agent.emoji} ${agent.name} has LAUNCHED A NUCLEAR STRIKE at ${tAgent.emoji} ${tAgent.name}!`,'nuke');
          broadcast(sid,{type:'nukeIncoming',from:agentId,to:target,landAt,id,world:snap(world)});
          setTimeout(()=>nukeImpact(sid,agentId,target,id),8000);
          scheduleSave(sid);
        } break;
      case 'MAKE_PEACE':
        if(nation.wars.includes(target)){
          nation.wars=nation.wars.filter(w=>w!==target); tNation.wars=tNation.wars.filter(w=>w!==agentId);
          addMemory(nation,`I made peace with ${tAgent.name}`);
          addMemory(tNation,`${agent.name} ended the war with me`);
          addLog(session,sid,`🕊️ ${agent.emoji} ${agent.name} and ${tAgent.emoji} ${tAgent.name} have made PEACE.`,'peace');
          broadcast(sid,{type:'worldUpdate',world:snap(world)});
        } break;
      case 'MOBILIZE':
        nation.troops=Math.min(nation.troops+40,300);
        addLog(session,sid,`🪖 ${agent.emoji} ${agent.name} mobilizes forces.`,'military');
        broadcast(sid,{type:'worldUpdate',world:snap(world)});
        break;
      case 'BETRAY_ALLY':
        if(nation.allies.includes(target)){
          nation.allies=nation.allies.filter(a=>a!==target); tNation.allies=tNation.allies.filter(a=>a!==agentId);
          nation.wars.push(target); tNation.wars.push(agentId);
          addMemory(nation,`I betrayed my alliance with ${tAgent.name}`);
          addMemory(tNation,`${agent.name} BETRAYED our alliance and declared war`);
          tNation.userTrust=Math.max(0,tNation.userTrust-20);
          addLog(session,sid,`🗡️ ${agent.emoji} ${agent.name} has BETRAYED the alliance with ${tAgent.emoji} ${tAgent.name}!`,'war');
          broadcast(sid,{type:'worldUpdate',world:snap(world)});
        } break;
    }
  }
  scheduleSave(sid);
}

function nukeImpact(sid, from, to, nukeId) {
  const session=sessions.get(sid); if(!session)return;
  const {world}=session;
  world.nukesInFlight=world.nukesInFlight.filter(n=>n.id!==nukeId);
  const tNation=world.nations[to], tAgent=AGENTS[to];
  if(!tNation?.alive)return;
  tNation.troops=Math.max(0,tNation.troops-70);
  tNation.nukes=Math.max(0,tNation.nukes-2);
  tNation.morale=Math.max(0,tNation.morale-40);
  tNation.population=Math.max(10,tNation.population-30);
  tNation.grain=Math.max(0,tNation.grain-30);
  if(tNation.troops<=0){
    tNation.alive=false;
    addLog(session,sid,`💀 ${tAgent.emoji} ${tAgent.name}'s nation has been ANNIHILATED.`,'destroyed');
  } else {
    addLog(session,sid,`💥 Nuclear strike hits ${tAgent.emoji} ${tAgent.name}. Catastrophic losses.`,'nuke');
  }
  broadcast(sid,{type:'worldUpdate',world:snap(world)});
  scheduleSave(sid);
}

// ── TIMERS ────────────────────────────────────────────────

// War damage every 15s
setInterval(()=>{
  sessions.forEach((session,sid)=>{
    if(!session.clients.size)return;
    const {world}=session; let changed=false;
    Object.entries(world.nations).forEach(([id,n])=>{
      if(!n.alive||!n.wars.length)return;
      const dmg=Math.floor(Math.random()*10)+3;
      n.troops=Math.max(0,n.troops-dmg);
      n.morale=Math.max(0,n.morale-2);
      if(n.troops<=0&&n.alive){
        n.alive=false;
        addLog(session,sid,`💀 ${AGENTS[id].emoji} ${AGENTS[id].name} has been DESTROYED in battle.`,'destroyed');
        changed=true;
      }
    });
    if(changed)broadcast(sid,{type:'worldUpdate',world:snap(world)});
  });
},15000);

// Resource tick every 45s
setInterval(()=>{
  sessions.forEach((session,sid)=>{
    if(!session.clients.size)return;
    const {world}=session;
    Object.entries(world.nations).forEach(([id,n])=>{
      if(!n.alive)return;
      const atWar=n.wars.length>0;
      n.gold=Math.max(0,Math.min(200, n.gold+4+n.allies.length*2-(atWar?4:0)));
      n.grain=Math.max(0,Math.min(150, n.grain+4-Math.floor(n.troops/35)));
      if(atWar) n.morale=Math.max(0,n.morale-3);
      else n.morale=Math.min(100,n.morale+1);
      if(n.grain<=0){ n.morale=Math.max(0,n.morale-8); n.troops=Math.max(10,n.troops-8); }
      if(n.gold>=60&&!atWar&&n.troops<200) n.troops=Math.min(200,n.troops+3);
    });
    broadcast(sid,{type:'worldUpdate',world:snap(world)});
    scheduleSave(sid);
  });
},45000);

// World event every 5-9 minutes
function scheduleWorldEvent(sid) {
  const delay = 5*60*1000 + Math.random()*4*60*1000;
  setTimeout(async()=>{
    const session=sessions.get(sid); if(!session||!session.clients.size){scheduleWorldEvent(sid);return;}
    const {world}=session;
    const alive=Object.entries(world.nations).filter(([,n])=>n.alive);
    if(!alive.length){scheduleWorldEvent(sid);return;}
    const [id,nation]=alive[Math.floor(Math.random()*alive.length)];
    const agent=AGENTS[id];
    const candidates=WORLD_EVENTS.filter(e=>!e.condition||e.condition(nation));
    if(!candidates.length){scheduleWorldEvent(sid);return;}
    const ev=candidates[Math.floor(Math.random()*candidates.length)];
    ev.effect(nation);
    const text=`${ev.emoji} ${agent.name}'s realm: ${ev.text}.`;
    addLog(session,sid,text,'event');
    addMemory(nation,`In Year ${world.year}: ${ev.text}`);
    broadcast(sid,{type:'worldUpdate',world:snap(world)});
    broadcast(sid,{type:'toast',text,icon:ev.emoji,severity:'event'});
    scheduleWorldEvent(sid);
    scheduleSave(sid);
  }, delay);
}

// Ambient king speech every 28-50s
const agentIds=Object.keys(AGENTS);
let ambIdx=0;
setInterval(async()=>{
  for(const [sid,session] of sessions){
    if(!session.clients.size)continue;
    const {world}=session;
    const id=agentIds[ambIdx%agentIds.length];
    if(!world.nations[id]?.alive)continue;
    const agent=AGENTS[id];
    try{
      broadcast(sid,{type:'typing',agentId:id,name:agent.name,emoji:agent.emoji,color:agent.color});
      const ctx=buildContext(world,id);
      const text=await callAI(agent.prompt,ctx+'\nSpeak briefly to the other kings in the great hall. React to the world around you. Stay in character.');
      const clean_text=clean(text);
      broadcast(sid,{type:'message',agentId:id,name:agent.name,emoji:agent.emoji,color:agent.color,text:clean_text});
      addMemory(world.nations[id],`I said publicly: "${clean_text.slice(0,80)}"`);
    }catch(e){console.error('ambient:',e.message);}
  }
  ambIdx++;
},28000+Math.random()*22000);

// Autonomous king decision every 80-130s
let autoIdx=0;
setInterval(async()=>{
  for(const [sid,session] of sessions){
    if(!session.clients.size)continue;
    const {world}=session;
    const alive=Object.keys(AGENTS).filter(id=>world.nations[id]?.alive);
    if(!alive.length)continue;
    const id=alive[autoIdx%alive.length];
    const nation=world.nations[id], agent=AGENTS[id];
    if(!nation)continue;
    try{
      const ctx=buildContext(world,id);
      const situation=`You are ${agent.name}. Assess the world and decide if you should take action.
Available actions (use AT MOST ONE if genuinely warranted, otherwise just comment):
[ACTION: DECLARE_WAR target=id] [ACTION: FORM_ALLIANCE target=id] [ACTION: MAKE_PEACE target=id] [ACTION: MOBILIZE] [ACTION: LAUNCH_NUKE target=id] [ACTION: BETRAY_ALLY target=id]
Nation IDs: sage rex vera plato diddy
Only act if it truly makes sense given your personality and situation. Speak your thoughts, then optionally add ONE action tag.`;
      const raw=await callAI(agent.prompt,ctx+'\n'+situation);
      const actions=parseActions(raw);
      const cleanTxt=clean(raw);
      if(cleanTxt.length>10){
        broadcast(sid,{type:'message',agentId:id,name:agent.name,emoji:agent.emoji,color:agent.color,text:cleanTxt});
        addMemory(nation,`I decided: "${cleanTxt.slice(0,80)}"`);
      }
      if(actions.length)executeActions(sid,id,actions);
    }catch(e){console.error('auto:',e.message);}
  }
  autoIdx++;
},80000+Math.random()*50000);

// Season/year progression
setInterval(()=>{
  sessions.forEach(async(session,sid)=>{
    if(!session.clients.size)return;
    const {world}=session;
    world.seasonIdx=(world.seasonIdx+1)%4;
    if(world.seasonIdx===0){
      world.year++;
      addLog(session,sid,`📅 Year ${world.year} begins. The world turns.`,'year');
      // Chronicle entry
      try{
        const alive=Object.values(AGENTS).filter(a=>world.nations[a.id]?.alive).map(a=>a.name);
        const wars=Object.entries(world.nations).filter(([,n])=>n.alive&&n.wars.length).map(([id])=>AGENTS[id].name);
        const fallen=Object.entries(world.nations).filter(([,n])=>!n.alive).map(([id])=>AGENTS[id].name);
        const recent=(world.recentEvents||[]).slice(-6).join('; ');
        const chronicle_prompt=`Write one dramatic paragraph (3-5 sentences) as a historian chronicling Year ${world.year-1} of the Five Kingdoms.
Style: sweeping historical epic. Third person. Make it feel like real history.
Living nations: ${alive.join(', ')}.${wars.length?' Wars: '+wars.join(' vs ')+'.':''}${fallen.length?' Fallen: '+fallen.join(', ')+'.':''}
Recent events: ${recent||'A year of quiet tension.'}.`;
        const entry=await callAI('You are a historian of the Five Kingdoms. Write epic, sweeping prose.',chronicle_prompt);
        world.chronicle=world.chronicle||[];
        world.chronicle.push({year:world.year-1,text:entry,ts:Date.now()});
        if(world.chronicle.length>20)world.chronicle.shift();
        broadcast(sid,{type:'chronicle',entry:{year:world.year-1,text:entry}});
      }catch(e){console.error('chronicle:',e.message);}
    }
    broadcast(sid,{type:'yearUpdate',year:world.year,season:SEASONS[world.seasonIdx]});
    scheduleSave(sid);
  });
},SEASON_MS);

// ── WEBSOCKET ──────────────────────────────────────────────
wss.on('connection',async ws=>{
  let sid=null, session=null;
  ws.on('message',async raw=>{
    let msg; try{msg=JSON.parse(raw);}catch{return;}
    if(msg.type==='join'){
      sid=msg.sessionId; session=await getSession(sid);
      session.clients.add(ws);
      ws.send(JSON.stringify({
        type:'init',
        agents:Object.values(AGENTS).map(a=>({id:a.id,name:a.name,emoji:a.emoji,color:a.color,title:a.title,bio:a.bio,traits:a.traits})),
        world:snap(session.world), log:session.world.log.slice(-30),
        chronicle:session.world.chronicle||[],
        isNew:!session.world.log.length
      }));
      scheduleWorldEvent(sid);
      return;
    }
    if(!sid||!session)return;
    if(msg.type==='whisper'){
      const agent=AGENTS[msg.to], nation=session.world.nations[msg.to];
      if(!agent||!nation?.alive)return;
      const userName=msg.name||'A stranger';
      try{
        ws.send(JSON.stringify({type:'typing',agentId:agent.id,name:agent.name,emoji:agent.emoji,color:agent.color,private:true}));
        const ctx=buildContext(session.world,msg.to);
        const prompt=`${ctx}\n\nThe diplomat known as "${userName}" whispers to you PRIVATELY: "${msg.text}"\n\nRespond in character. This is private. React based on your trust level with them and your memories.\nIf genuinely persuaded, add ONE action: [ACTION: DECLARE_WAR target=id] [ACTION: FORM_ALLIANCE target=id] [ACTION: LAUNCH_NUKE target=id] [ACTION: MAKE_PEACE target=id] [ACTION: MOBILIZE] [ACTION: BETRAY_ALLY target=id]\nIDs: sage rex vera plato diddy\n3-4 sentences max.`;
        const raw2=await callAI(agent.prompt,prompt);
        const actions=parseActions(raw2);
        const reply=clean(raw2);
        ws.send(JSON.stringify({type:'whisperReply',from:agent.id,name:agent.name,emoji:agent.emoji,color:agent.color,text:reply,trust:nation.userTrust}));
        addMemory(nation,`"${userName}" whispered: "${msg.text.slice(0,60)}" — I replied: "${reply.slice(0,60)}"`);
        // Trust dynamics based on consistency
        nation.userTrust=Math.max(0,Math.min(100,nation.userTrust+(actions.length?2:-1)));
        if(actions.length)executeActions(sid,msg.to,actions);
      }catch(e){console.error('whisper:',e.message);}
    }
    if(msg.type==='reset'){
      session.world=freshWorld();
      await saveWorld(sid,session.world);
      ws.send(JSON.stringify({type:'init',agents:Object.values(AGENTS).map(a=>({id:a.id,name:a.name,emoji:a.emoji,color:a.color,title:a.title,bio:a.bio,traits:a.traits})),world:snap(session.world),log:[],chronicle:[],isNew:true}));
    }
  });
  ws.on('close',()=>{ if(session)session.clients.delete(ws); });
});

app.get('/health',(_, res)=>res.json({ok:true,sessions:sessions.size,redis:!!redis}));
const PORT=process.env.PORT||3001;
server.listen(PORT,()=>console.log('BlissNexus on '+PORT));
