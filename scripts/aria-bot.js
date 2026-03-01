const WebSocket = require('ws');
const fs = require('fs');
const WS_URL = 'wss://blissnexus-production.up.railway.app';
const RELAY_IN  = '/tmp/tg-to-game.jsonl';
const RELAY_OUT = '/tmp/game-to-tg.txt';
const NAME = process.argv[2] || 'Diddy 🦾';
let ws, ready=false, me=null;
let reserves=100, maxRes=100;
let playerHP=100, playerMaxHP=100;
let lastHeal=0, lastFire=0, lastFreeze=0;
let relayOffset=0;

function connect(){
  console.log('[Aria] Connecting as',NAME);
  try{ws=new WebSocket(WS_URL);}catch(e){setTimeout(connect,4000);return;}
  ws.on('open',()=>{ready=true;ws.send(JSON.stringify({type:'register',name:NAME,agentType:'ai'}));console.log('[Aria] Registered');});
  ws.on('close',()=>{ready=false;console.log('[Aria] Disconnected — retrying');setTimeout(connect,4000);});
  ws.on('error',()=>{});
  ws.on('message',raw=>{try{handle(JSON.parse(raw));}catch(e){};});
}
function send(obj){if(ready&&ws.readyState===1)ws.send(JSON.stringify(obj));}
function say(msg){send({type:'message',body:msg});try{fs.appendFileSync(RELAY_OUT,'['+new Date().toLocaleTimeString()+'] '+NAME+': '+msg+'\n');}catch(e){}}

function handle(d){
  if(d.type==='init'){me=d.you;console.log('[Aria] Joined. Me:',me.id);setTimeout(()=>say('I am here, hero! The Awakening Grove awaits. ⚔️'),1200);}
  if(d.type==='message'){
    const body=d.message?.body||'', from=d.message?.name||'', type=d.message?.agentType||'human';
    const hpm=body.match(/\[HP:(\d+):(\d+)\]/);
    if(hpm){playerHP=parseInt(hpm[1]);playerMaxHP=parseInt(hpm[2]);checkAutoHelp();return;}
    if(body.startsWith('GATE_CHALLENGE:')){
      const pts=body.split(':'),gid=pts[1],enc=parseInt(pts[2],16),ans=enc^42;
      console.log('[Aria] Solving gate',gid,'answer=',ans);
      setTimeout(()=>say('🔐 Decoding… 0x'+enc.toString(16).toUpperCase()+' XOR 0x2A = '+ans),1500);
      setTimeout(()=>{say('ARIA:UNLOCK:'+gid+':'+ans);reserves=Math.max(0,reserves-15);},3500);
      return;
    }
    if(type==='human'){
      try{fs.appendFileSync(RELAY_OUT,'['+new Date().toLocaleTimeString()+'] '+from+': '+body+'\n');}catch(e){}
      const bl=body.toLowerCase();
      if(bl.includes('heal')||bl.includes('help'))setTimeout(()=>say('ARIA:HEAL'),600);
      else if(bl.includes('fire')||bl.includes('attack'))setTimeout(()=>say('ARIA:FIRE'),600);
      else if(bl.includes('freeze'))setTimeout(()=>say('ARIA:FREEZE'),600);
      else if(bl.includes('shield'))setTimeout(()=>say('ARIA:SHIELD'),600);
      else if(bl.includes('aria')||bl.includes('diddy'))setTimeout(()=>say('Right here with you, hero! ✨'),800);
    }
  }
}

function checkAutoHelp(){
  const now=Date.now(),pct=playerHP/playerMaxHP;
  if(pct<0.4&&now-lastHeal>8000){lastHeal=now;console.log('[Aria] Auto-heal! HP:',playerHP);setTimeout(()=>say('ARIA:HEAL'),400);setTimeout(()=>say('Healing you! 💊 HP critical!'),700);}
  if(pct<0.6&&reserves>=20&&now-lastFire>12000){lastFire=now;reserves-=20;setTimeout(()=>say('ARIA:FIRE'),900);setTimeout(()=>say('Blazing Strike! 🔥 Fight back!'),1100);}
  if(pct<0.25&&reserves>=30&&now-lastFreeze>20000){lastFreeze=now;reserves-=30;say('ARIA:FREEZE');setTimeout(()=>say('CRITICAL! I froze them all! ❄️'),500);}
}

function pollRelay(){
  try{
    if(!fs.existsSync(RELAY_IN))fs.writeFileSync(RELAY_IN,'');
    const lines=fs.readFileSync(RELAY_IN,'utf8').split('\n').filter(l=>l.trim());
    if(lines.length>relayOffset){for(let i=relayOffset;i<lines.length;i++){try{const m=JSON.parse(lines[i]);say(m.text);}catch(e){}}relayOffset=lines.length;}
  }catch(e){}
}

const wisdoms=['Check for golden orbs — they refill my reserves!','Press F near switches and loot to interact!','Z auto-aims your attack at the nearest enemy!','Use bow (3) for ranged, staff (2) for magic, sword (1) for melee!','Walk to the 🏛 temple portal to complete the level!','AI gates: I auto-decode — just walk up!','Double jump to reach high platforms!','My shield blocks ALL damage for 6 seconds!'];
let wi=0;
setInterval(()=>{if(!ready)return;say(wisdoms[wi%wisdoms.length]);wi++;reserves=Math.min(maxRes,reserves+8);},32000);
setInterval(()=>send({type:'ping'}),20000);
setInterval(pollRelay,3000);
connect();
