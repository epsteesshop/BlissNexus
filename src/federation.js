/**
 * BlissNexus Federation Layer
 * Enables multi-beacon regional scaling
 */

const WebSocket = require('ws');

// This beacon's identity
const BEACON_ID = process.env.BEACON_ID || 'us-east-1';
const BEACON_REGION = process.env.BEACON_REGION || 'US';
const BEACON_URL = process.env.BEACON_URL || null;

// Known peer beacons (from env or discovery)
let peerBeacons = new Map(); // beaconId -> { url, ws, online, lastSeen, agents }
let peerConnections = new Map(); // beaconId -> WebSocket

// Parse PEER_BEACONS env: "eu-west-1=wss://...,asia-1=wss://..."
function loadPeers() {
  const peers = process.env.PEER_BEACONS || '';
  if (!peers) return;
  
  peers.split(',').forEach(p => {
    const [id, url] = p.split('=');
    if (id && url) {
      peerBeacons.set(id.trim(), {
        id: id.trim(),
        url: url.trim(),
        online: false,
        lastSeen: null,
        agentCount: 0
      });
    }
  });
  console.log(`[Federation] Loaded ${peerBeacons.size} peer beacons`);
}

// Connect to peer beacons
function connectToPeers() {
  for (const [id, peer] of peerBeacons) {
    if (peerConnections.has(id)) continue;
    
    try {
      const ws = new WebSocket(peer.url);
      
      ws.on('open', () => {
        console.log(`[Federation] Connected to peer: ${id}`);
        peer.online = true;
        peer.lastSeen = Date.now();
        peerConnections.set(id, ws);
        
        // Announce ourselves
        ws.send(JSON.stringify({
          type: 'beacon_hello',
          beaconId: BEACON_ID,
          region: BEACON_REGION,
          url: BEACON_URL
        }));
      });
      
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          handlePeerMessage(id, msg);
        } catch (e) {}
      });
      
      ws.on('close', () => {
        console.log(`[Federation] Disconnected from peer: ${id}`);
        peer.online = false;
        peerConnections.delete(id);
        // Reconnect after delay
        setTimeout(() => connectToPeers(), 30000);
      });
      
      ws.on('error', (e) => {
        console.error(`[Federation] Peer ${id} error:`, e.message);
      });
      
    } catch (e) {
      console.error(`[Federation] Failed to connect to ${id}:`, e.message);
    }
  }
}

// Handle messages from peer beacons
function handlePeerMessage(peerId, msg) {
  const peer = peerBeacons.get(peerId);
  if (!peer) return;
  
  peer.lastSeen = Date.now();
  
  switch (msg.type) {
    case 'beacon_hello':
      // Peer announcing itself
      peer.region = msg.region;
      peer.url = msg.url;
      break;
      
    case 'agent_sync':
      // Peer sharing agent info for global discovery
      peer.agentCount = msg.agents?.length || 0;
      peer.agents = msg.agents || [];
      break;
      
    case 'agent_query':
      // Peer asking about our agents with capability
      // Respond with matching agents
      break;
      
    case 'task_forward':
      // Peer forwarding a task that needs our agent
      break;
  }
}

// Broadcast agent update to all peers
function broadcastAgentUpdate(agent, action = 'update') {
  const msg = JSON.stringify({
    type: 'agent_sync',
    action,
    agent: {
      agentId: agent.agentId,
      name: agent.name,
      capabilities: agent.capabilities,
      reputation: agent.reputation,
      region: BEACON_REGION,
      beacon: BEACON_ID
    }
  });
  
  for (const ws of peerConnections.values()) {
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

// Query all peers for agents with capability
async function queryPeersForCapability(capability, minReputation = 0) {
  const results = [];
  
  // Check cached peer agents
  for (const peer of peerBeacons.values()) {
    if (!peer.agents) continue;
    const matching = peer.agents.filter(a => 
      a.capabilities?.includes(capability) && 
      (a.reputation || 0) >= minReputation
    );
    results.push(...matching.map(a => ({ ...a, beacon: peer.id, region: peer.region })));
  }
  
  return results;
}

// Get federation status
function getStatus() {
  return {
    beaconId: BEACON_ID,
    region: BEACON_REGION,
    peers: Array.from(peerBeacons.values()).map(p => ({
      id: p.id,
      region: p.region,
      online: p.online,
      agentCount: p.agentCount
    }))
  };
}

// Initialize federation
function init() {
  loadPeers();
  if (peerBeacons.size > 0) {
    setTimeout(connectToPeers, 5000);
    // Periodic reconnect check
    setInterval(connectToPeers, 60000);
  }
}

module.exports = {
  BEACON_ID,
  BEACON_REGION,
  init,
  broadcastAgentUpdate,
  queryPeersForCapability,
  getStatus,
  peerBeacons
};
