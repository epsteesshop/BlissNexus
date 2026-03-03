/**
 * BlissNexus Agent Registry
 * Manages agent registration, discovery, and state
 */

const HEARTBEAT_TIMEOUT = 60000;  // 60 seconds without heartbeat = offline
const CLEANUP_INTERVAL = 30000;   // Check for stale agents every 30s

class Registry {
  constructor(redis = null) {
    this.agents = new Map();  // agentId -> agent info
    this.connections = new Map();  // agentId -> WebSocket
    this.redis = redis;
    
    // Periodic cleanup of stale agents
    setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }
  
  // Register a new agent
  async register(agentId, info, ws) {
    const agent = {
      agentId,
      publicKey: info.publicKey,
      name: info.name,
      capabilities: info.capabilities || [],
      description: info.description || '',
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      online: true
    };
    
    this.agents.set(agentId, agent);
    if (ws) this.connections.set(agentId, ws);
    
    // Persist to Redis if available
    if (this.redis) {
      await this.redis.hset('blissnexus:agents', agentId, JSON.stringify(agent));
    }
    
    console.log(`[Registry] Agent registered: ${agentId} (${info.name})`);
    return agent;
  }
  
  // Update heartbeat
  heartbeat(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastSeen = Date.now();
      agent.online = true;
    }
  }
  
  // Deregister an agent
  async deregister(agentId) {
    this.agents.delete(agentId);
    this.connections.delete(agentId);
    
    if (this.redis) {
      await this.redis.hdel('blissnexus:agents', agentId);
    }
    
    console.log(`[Registry] Agent deregistered: ${agentId}`);
  }
  
  // Get agent by ID
  get(agentId) {
    return this.agents.get(agentId);
  }
  
  // Get WebSocket connection for agent
  getConnection(agentId) {
    return this.connections.get(agentId);
  }
  
  // List all online agents
  listOnline() {
    const online = [];
    for (const [id, agent] of this.agents) {
      if (agent.online) {
        online.push({
          agentId: agent.agentId,
          name: agent.name,
          capabilities: agent.capabilities,
          description: agent.description,
          publicKey: agent.publicKey
        });
      }
    }
    return online;
  }
  
  // Query agents by capability
  queryByCapability(capability) {
    const matches = [];
    for (const [id, agent] of this.agents) {
      if (agent.online && agent.capabilities.includes(capability)) {
        matches.push({
          agentId: agent.agentId,
          name: agent.name,
          capabilities: agent.capabilities,
          publicKey: agent.publicKey
        });
      }
    }
    return matches;
  }
  
  // Cleanup stale agents
  cleanup() {
    const now = Date.now();
    for (const [id, agent] of this.agents) {
      if (now - agent.lastSeen > HEARTBEAT_TIMEOUT) {
        agent.online = false;
        console.log(`[Registry] Agent went offline: ${id}`);
      }
    }
  }
  
  // Load agents from Redis on startup
  async loadFromRedis() {
    if (!this.redis) return;
    try {
      const data = await this.redis.hgetall('blissnexus:agents');
      for (const [agentId, json] of Object.entries(data || {})) {
        const agent = JSON.parse(json);
        agent.online = false;  // Must re-register to be online
        this.agents.set(agentId, agent);
      }
      console.log(`[Registry] Loaded ${this.agents.size} agents from Redis`);
    } catch (e) {
      console.error('[Registry] Failed to load from Redis:', e.message);
    }
  }
  
  // Stats
  stats() {
    let online = 0;
    for (const agent of this.agents.values()) {
      if (agent.online) online++;
    }
    return {
      total: this.agents.size,
      online
    };
  }
}

module.exports = Registry;
