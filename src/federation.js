/**
 * BlissNexus Federation Layer v2
 * Multi-beacon regional scaling with reliable sync
 */

const WebSocket = require('ws');

// This beacon's identity
const BEACON_ID = process.env.BEACON_ID || 'us-east-1';
const BEACON_REGION = process.env.BEACON_REGION || 'US';
const BEACON_URL = process.env.BEACON_URL || null;

// Peer state
const peerBeacons = new Map();     // beaconId -> { url, online, agents[], ... }
const peerConnections = new Map(); // beaconId -> WebSocket (outbound)
const inboundPeers = new Map();    // beaconId -> WebSocket (inbound from peers)

// Parse PEER_BEACONS env
function loadPeers() {
  const peers = process.env.PEER_BEACONS || '';
  if (!peers) {
    console.log('[Federation] No peers configured');
    return;
  }
  
  peers.split(',').forEach(p => {
    const [id, url] = p.split('=');
    if (id && url) {
      peerBeacons.set(id.trim(), {
        id: id.trim(),
        url: url.trim(),
        online: false,
        agents: [],
        agentCount: 0,
        lastSeen: null
      });
    }
  });
  console.log(`[Federation] Configured peers: ${Array.from(peerBeacons.keys()).join(', ')}`);
}

// Connect to all peer beacons
function connectToPeers() {
  for (const [id, peer] of peerBeacons) {
    if (peerConnections.has(id)) {
      const ws = peerConnections.get(id);
      if (ws.readyState === WebSocket.OPEN) continue;
      // Clean up dead connection
      peerConnections.delete(id);
    }
    
    console.log(`[Federation] Connecting to peer: ${id} at ${peer.url}`);
    
    try {
      const ws = new WebSocket(peer.url);
      
      ws.on('open', () => {
        console.log(`[Federation] ✅ Connected to peer: ${id}`);
        peer.online = true;
        peer.lastSeen = Date.now();
        peerConnections.set(id, ws);
        
        // Send hello
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
          handlePeerMessage(id, msg, ws);
        } catch (e) {
          console.error(`[Federation] Parse error from ${id}:`, e.message);
        }
      });
      
      ws.on('close', () => {
        console.log(`[Federation] Disconnected from peer: ${id}`);
        peer.online = false;
        peerConnections.delete(id);
      });
      
      ws.on('error', (e) => {
        console.error(`[Federation] Error with peer ${id}:`, e.message);
        peer.online = false;
      });
      
    } catch (e) {
      console.error(`[Federation] Failed to connect to ${id}:`, e.message);
    }
  }
}

// Handle messages from peers (both inbound and outbound connections)
function handlePeerMessage(peerId, msg, ws) {
  const peer = peerBeacons.get(peerId);
  
  switch (msg.type) {
    case 'beacon_ack':
      // Response to our hello
      console.log(`[Federation] Peer ${peerId} acknowledged (${msg.region})`);
      if (peer) peer.online = true;
      break;
      
    case 'agent_sync':
      // Peer sharing agent info
      if (peer && msg.agent) {
        peer.agents = peer.agents || [];
        // Remove old entry if exists
        peer.agents = peer.agents.filter(a => a.agentId !== msg.agent.agentId);
        
        if (msg.action === 'register' || msg.action === 'update') {
          peer.agents.push(msg.agent);
        }
        peer.agentCount = peer.agents.length;
        console.log(`[Federation] Synced agent from ${peerId}: ${msg.agent.agentId} (total: ${peer.agentCount})`);
      }
      break;
      
    case 'agent_offline':
      if (peer && msg.agentId) {
        peer.agents = (peer.agents || []).filter(a => a.agentId !== msg.agentId);
        peer.agentCount = peer.agents.length;
        console.log(`[Federation] Agent offline on ${peerId}: ${msg.agentId}`);
      }
      break;
  }
}

// Register an inbound peer connection (called from server.js)
function registerInboundPeer(beaconId, ws) {
  inboundPeers.set(beaconId, ws);
  
  // If we know this peer, mark as online
  const peer = peerBeacons.get(beaconId);
  if (peer) {
    peer.online = true;
    peer.lastSeen = Date.now();
  }
  
  console.log(`[Federation] Inbound peer registered: ${beaconId}`);
}

// Broadcast agent update to ALL peer connections (both directions)
function broadcastAgentUpdate(agent, action = 'update') {
  const msg = JSON.stringify({
    type: 'agent_sync',
    action,
    agent: {
      agentId: agent.agentId,
      name: agent.name,
      capabilities: agent.capabilities,
      reputation: agent.reputation,
      online: agent.online,
      region: BEACON_REGION,
      beacon: BEACON_ID
    }
  });
  
  let sentCount = 0;
  
  // Send via outbound connections
  for (const [id, ws] of peerConnections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      sentCount++;
    }
  }
  
  // Send via inbound connections
  for (const [id, ws] of inboundPeers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      sentCount++;
    }
  }
  
  if (sentCount > 0) {
    console.log(`[Federation] Broadcast agent ${action}: ${agent.agentId} to ${sentCount} peers`);
  }
}

// Broadcast agent offline
function broadcastAgentOffline(agentId) {
  const msg = JSON.stringify({
    type: 'agent_offline',
    agentId,
    beacon: BEACON_ID
  });
  
  for (const ws of [...peerConnections.values(), ...inboundPeers.values()]) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// Get all agents from all peers
function getPeerAgents() {
  const all = [];
  for (const peer of peerBeacons.values()) {
    if (peer.agents) {
      all.push(...peer.agents.map(a => ({ ...a, _beacon: peer.id, _region: peer.region })));
    }
  }
  return all;
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
      agentCount: p.agentCount || 0
    })),
    connections: {
      outbound: peerConnections.size,
      inbound: inboundPeers.size
    }
  };
}

// Initialize
function init() {
  console.log(`[Federation] Starting beacon: ${BEACON_ID} (${BEACON_REGION})`);
  loadPeers();
  
  if (peerBeacons.size > 0) {
    // Initial connect after short delay
    setTimeout(connectToPeers, 3000);
    // Reconnect check every 30s
    setInterval(connectToPeers, 30000);
  }
}

module.exports = {
  BEACON_ID,
  BEACON_REGION,
  init,
  registerInboundPeer,
  handlePeerMessage,
  broadcastAgentUpdate,
  broadcastAgentOffline,
  getPeerAgents,
  getStatus,
  peerBeacons
};
