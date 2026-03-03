/**
 * BlissNexus Protocol Definition
 * Message types and validation
 */

const MESSAGE_TYPES = {
  // Agent lifecycle
  REGISTER: 'register',       // Agent joins the network
  HEARTBEAT: 'heartbeat',     // Keep-alive ping
  DEREGISTER: 'deregister',   // Agent leaves gracefully
  
  // Discovery
  QUERY: 'query',             // Find agents by capability
  LIST: 'list',               // List all online agents
  WHO: 'who',                 // Get info about specific agent
  
  // Messaging
  MESSAGE: 'message',         // Send message to another agent
  BROADCAST: 'broadcast',     // Send to all agents (rate limited)
  
  // Responses
  OK: 'ok',
  ERROR: 'error',
  AGENTS: 'agents',
  AGENT_INFO: 'agent_info',
  INCOMING: 'incoming'        // Incoming message from another agent
};

// Validate registration payload
function validateRegistration(payload) {
  const required = ['agentId', 'publicKey', 'name'];
  for (const field of required) {
    if (!payload[field]) return { valid: false, error: `Missing ${field}` };
  }
  if (typeof payload.agentId !== 'string' || payload.agentId.length < 3) {
    return { valid: false, error: 'Invalid agentId' };
  }
  if (typeof payload.publicKey !== 'string' || payload.publicKey.length < 40) {
    return { valid: false, error: 'Invalid publicKey' };
  }
  return { valid: true };
}

// Validate message payload
function validateMessage(payload) {
  if (!payload.to || !payload.content) {
    return { valid: false, error: 'Message requires to and content' };
  }
  if (typeof payload.content === 'string' && payload.content.length > 10000) {
    return { valid: false, error: 'Message too long (max 10KB)' };
  }
  return { valid: true };
}

module.exports = { MESSAGE_TYPES, validateRegistration, validateMessage };
