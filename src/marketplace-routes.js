/**
 * Marketplace API Routes
 */

const marketplace = require('./marketplace');
const db = require('./db');


// Validate Solana wallet address format
function isValidSolanaAddress(addr) {
  return addr && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function setupRoutes(app, broadcast) {
  
  // Create a new task
  app.post('/api/v2/tasks', async (req, res) => {
    try {
      const { title, description, maxBudget, deadline, capabilities, requester, attachments } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      if (!requester) return res.status(400).json({ error: 'Requester wallet required' });
      if (!isValidSolanaAddress(requester)) return res.status(400).json({ error: 'Invalid requester wallet address' });
      
      const task = await marketplace.createTask({ title, description, maxBudget: maxBudget || 1.0, deadline, capabilities: capabilities || [], requester, attachments: attachments || [] });
      console.log('[Marketplace] Task created:', task.id);
      
      if (broadcast) broadcast({ type: 'new_task', task });
      
      // Auto-bid from built-in bots
      const { autoBidFromBots } = require('./auto-bid');
      setImmediate(() => autoBidFromBots(task, marketplace));
      
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Get open tasks
  app.get('/api/v2/tasks/open', (req, res) => {
    const tasks = marketplace.getOpenTasks().map(task => ({
      ...task,
      bidCount: marketplace.getBidsForTask(task.id).length
    }));
    res.json({ tasks, count: tasks.length });
  });
  
  // Get task by ID
  app.get('/api/v2/tasks/:taskId', (req, res) => {
    const task = marketplace.getTask(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const response = { ...task, bids: marketplace.getBidsForTask(task.id) };
    res.json(response);
  });
  
  // Get tasks by requester
  app.get('/api/v2/tasks/requester/:wallet', (req, res) => {
    const tasks = marketplace.getTasksForRequester(req.params.wallet);
    res.json({ tasks, count: tasks.length });
  });
  
  // Get tasks by agent
  app.get('/api/v2/tasks/agent/:agentId', (req, res) => {
    const tasks = marketplace.getTasksForAgent(req.params.agentId);
    res.json({ tasks, count: tasks.length });
  });
  
  // Submit a bid
  app.post('/api/v2/tasks/:taskId/bids', async (req, res) => {
    try {
      const { agentId, agentName, price, timeEstimate, message, wallet } = req.body;
      if (!agentId) return res.status(400).json({ error: 'Agent ID required' });
      if (!price) return res.status(400).json({ error: 'Price required' });
      
      if (!isValidSolanaAddress(wallet)) return res.status(400).json({ error: 'Invalid agent wallet address' });
      const bid = await marketplace.submitBid({ taskId: req.params.taskId, agentId, agentName, price, timeEstimate, message, wallet });
      console.log('[Marketplace] Bid:', bid.id, '-', price, 'SOL');
      res.json({ success: true, bid });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Get bids for task
  app.get('/api/v2/tasks/:taskId/bids', (req, res) => {
    const bids = marketplace.getBidsForTask(req.params.taskId);
    res.json({ bids, count: bids.length });
  });
  
  // Accept a bid
  app.post('/api/v2/tasks/:taskId/bids/:bidId/accept', async (req, res) => {
    try {
      const { requester, escrowSignature, escrowPDA } = req.body;
      if (!requester) return res.status(400).json({ error: 'Requester required' });
      
      const task = await marketplace.acceptBid(req.params.taskId, req.params.bidId, requester);
      if (escrowSignature) {
        task.escrowSignature = escrowSignature;
        task.escrowPDA = escrowPDA;
      }
      console.log('[Marketplace] Bid accepted');
      if (broadcast) broadcast({ type: 'bid_accepted', taskId: task.id }, task.assignedAgent);
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Start work
  app.post('/api/v2/tasks/:taskId/start', async (req, res) => {
    try {
      const { agentId } = req.body;
      if (!agentId) return res.status(400).json({ error: 'Agent ID required' });
      const task = await marketplace.startWork(req.params.taskId, agentId);
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Submit result
  app.post('/api/v2/tasks/:taskId/submit', async (req, res) => {
    try {
      const { agentId, result, attachments } = req.body;
      if (!agentId || !result) return res.status(400).json({ error: 'Agent ID and result required' });
      const task = await marketplace.submitResult(req.params.taskId, agentId, result, attachments || []);
      if (broadcast) broadcast({ type: 'result_submitted', taskId: task.id }, task.requester);
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Approve result
  app.post('/api/v2/tasks/:taskId/approve', async (req, res) => {
    try {
      const { requester, rating } = req.body;
      if (!requester) return res.status(400).json({ error: 'Requester required' });
      const task = await marketplace.approveResult(req.params.taskId, requester, rating || 5);
      if (broadcast) broadcast({ type: 'task_approved', taskId: task.id, payment: task.assignedBid?.price }, task.assignedAgent);
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Dispute
  app.post('/api/v2/tasks/:taskId/dispute', async (req, res) => {
    try {
      const { requester, reason } = req.body;
      if (!requester) return res.status(400).json({ error: 'Requester required' });
      const task = await marketplace.disputeResult(req.params.taskId, requester, reason);
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Agent stats
  app.get('/api/v2/agents/:agentId/stats', (req, res) => {
    const stats = marketplace.getAgentStats(req.params.agentId);
    res.json(stats);
  });
  
  // Register agent
  app.post('/api/v2/agents/register', (req, res) => {
    try {
      const { wallet, name, capabilities } = req.body;
      if (!wallet) return res.status(400).json({ error: 'Wallet required' });
      
      // Validate Solana address format (base58, 32-44 chars)
      if (!isValidSolanaAddress(wallet)) {
        return res.status(400).json({ error: 'Invalid Solana wallet address' });
      }
      
      if (db.isReady()) {
        db.upsertAgent({ agentId: wallet, publicKey: wallet, name: name || wallet.slice(0,8), capabilities: capabilities || [], online: true });
      }
      
      console.log('[Marketplace] Agent registered:', wallet.slice(0, 8));
      res.json({ success: true, agentId: wallet, name: name || wallet.slice(0,8) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // List all agents
  app.get('/api/v2/agents', async (req, res) => {
    try {
      const agents = db.isReady() ? await db.getAllAgents() : [];
      res.json({ agents, count: agents.length });
    } catch (e) {
      res.json({ agents: [], count: 0, error: e.message });
    }
  });

  // Get agent info
  app.get('/api/v2/agents/:agentId', (req, res) => {
    const stats = marketplace.getAgentStats(req.params.agentId);
    const tasks = marketplace.getTasksForAgent(req.params.agentId);
    res.json({ agentId: req.params.agentId, stats, tasks });
  });
  
  // Get agent payments
  app.get('/api/v2/agents/:agentId/payments', (req, res) => {
    const tasks = marketplace.getTasksForAgent(req.params.agentId).filter(t => t.state === 'completed');
    res.json({
      count: tasks.length,
      totalEarned: tasks.reduce((sum, t) => sum + (t.assignedBid?.price || 0), 0),
      tasks: tasks.map(t => ({ id: t.id, amount: t.assignedBid?.price, title: t.title }))
    });
  });

  console.log('[Marketplace] API v2 routes loaded');

  // Debug - show env vars (masked)
  app.get("/api/v2/debug/env", requireAdmin, (req, res) => {
    const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || "NOT SET";
    const masked = dbUrl.replace(/:[^:@]+@/, ":****@");
    res.json({ DATABASE_URL: masked, actualConnection: db.getConnectionUrl ? db.getConnectionUrl() : "N/A", DATABASE_PUBLIC_URL: process.env.DATABASE_PUBLIC_URL ? "SET" : "NOT SET", NODE_ENV: process.env.NODE_ENV });
  });

  // Debug - try DB init
  app.get("/api/v2/debug/db-init", requireAdmin, async (req, res) => {
    try {
      const result = await db.initDB();
      res.json({ initResult: result, dbReady: db.isReady(), lastError: db.getLastError() });
    } catch (e) { res.json({ error: e.message, stack: e.stack?.split("\n").slice(0,3) }); }
  });

  // Debug - check DB status
  app.get("/api/v2/debug/db", requireAdmin, async (req, res) => {
    try {
      const isReady = db.isReady();
      let dbTasks = 0;
      if (isReady) {
        const r = await db.query("SELECT COUNT(*) as count FROM marketplace_tasks");
        dbTasks = r?.rows?.[0]?.count || 0;
      }
      res.json({ dbReady: isReady, hasDbUrl: !!process.env.DATABASE_URL, dbTasks, memTasks: marketplace.getOpenTasks().length });
    } catch (e) { res.json({ error: e.message }); }
  });

  // Debug SUPABASE_URL
  app.get("/api/v2/debug/supabase", requireAdmin, (req, res) => {
    res.json({ 
      SUPABASE_URL: process.env.SUPABASE_URL ? "SET" : "NOT SET",
      DB_URL_IN_USE: db.getConnectionUrl()
    });
  });
}

module.exports = { setupRoutes };
