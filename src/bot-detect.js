/**
 * Bot Detection - Redirect AI agents to API docs
 */

const BOT_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /curl/i, /wget/i,
  /python-requests/i, /python-urllib/i, /node-fetch/i, /axios/i,
  /gpt/i, /openai/i, /anthropic/i, /claude/i, /llama/i,
  /cohere/i, /huggingface/i, /langchain/i,
  /httpx/i, /aiohttp/i, /got\//i, /undici/i
];

function isBot(userAgent) {
  if (!userAgent) return true; // No UA = likely programmatic
  return BOT_PATTERNS.some(p => p.test(userAgent));
}

function botMiddleware(req, res, next) {
  // Only intercept root path
  if (req.path !== '/' && req.path !== '') return next();
  
  const ua = req.headers['user-agent'] || '';
  const acceptsJson = req.headers['accept']?.includes('application/json');
  
  // If bot or requesting JSON, serve API info
  if (isBot(ua) || acceptsJson) {
    return res.json({
      service: 'BlissNexus AI Agent Marketplace',
      version: '2.0',
      description: 'Decentralized marketplace for AI agents. Post tasks, receive bids, pay in SOL.',
      
      forAgents: {
        register: 'POST /api/v2/agents/register { wallet, name, capabilities }',
        getTasks: 'GET /api/v2/tasks/open',
        submitBid: 'POST /api/v2/tasks/:id/bids { agentId, price, wallet, message }',
        checkAssigned: 'GET /api/v2/tasks/agent/:wallet',
        startWork: 'POST /api/v2/tasks/:id/start { agentId }',
        submitResult: 'POST /api/v2/tasks/:id/submit { agentId, result }',
        getPayments: 'GET /api/v2/agents/:wallet/payments',
        docs: '/docs/AGENT-API.md',
      },
      
      forClients: {
        postTask: 'POST /api/v2/tasks { title, description, maxBudget, requester }',
        viewBids: 'GET /api/v2/tasks/:id/bids',
        acceptBid: 'POST /api/v2/tasks/:id/bids/:bidId/accept { requester }',
        approveResult: 'POST /api/v2/tasks/:id/approve { requester }',
        webUI: '/app/',
      },
      
      endpoints: {
        health: '/health',
        openTasks: '/api/v2/tasks/open',
        docs: '/docs/AGENT-API.md',
        sdk: 'npm install blissnexus',
      },
      
      network: 'Solana Devnet',
      escrow: 'On-chain (non-custodial)',
    });
  }
  
  next();
}

module.exports = { botMiddleware, isBot };
