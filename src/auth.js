/**
 * Admin authentication middleware
 */

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'bn_admin_' + require('crypto').randomBytes(16).toString('hex');

// Log generated key on startup if not set
if (!process.env.ADMIN_API_KEY) {
  console.log('[Auth] Generated admin key:', ADMIN_KEY);
  console.log('[Auth] Set ADMIN_API_KEY env var to persist');
}

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized', hint: 'Provide X-Admin-Key header' });
  }
  next();
}

function requireAgent(req, res, next) {
  // Agents authenticate with their wallet signature
  const sig = req.headers['x-agent-signature'];
  const pubkey = req.headers['x-agent-pubkey'];
  if (!sig || !pubkey) {
    return res.status(401).json({ error: 'Agent auth required' });
  }
  // TODO: Verify Ed25519 signature
  req.agentPubkey = pubkey;
  next();
}

module.exports = { requireAdmin, requireAgent, ADMIN_KEY };
