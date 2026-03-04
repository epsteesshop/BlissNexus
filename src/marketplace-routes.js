/**
 * Marketplace API Routes
 */

const marketplace = require('./marketplace');

function setupRoutes(app, broadcast) {
  
  // Create a new task (open for bidding)
  app.post('/api/v2/tasks', (req, res) => {
    try {
      const { title, description, maxBudget, deadline, capabilities, requester } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      if (!requester) return res.status(400).json({ error: 'Requester wallet required' });
      
      const task = marketplace.createTask({ title, description, maxBudget: maxBudget || 1.0, deadline, capabilities: capabilities || [], requester });
      console.log('[Marketplace] Task created:', task.id);
      
      if (broadcast) {
        broadcast({ type: 'new_task', task: { id: task.id, title: task.title, description: task.description, maxBudget: task.maxBudget, capabilities: task.capabilities, createdAt: task.createdAt }});
      }
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Get open tasks
  app.get('/api/v2/tasks/open', (req, res) => {
    const capabilities = req.query.capabilities ? req.query.capabilities.split(',') : [];
    const tasks = marketplace.getOpenTasks({ capabilities });
    res.json({ tasks, count: tasks.length });
  });
  
  // Get task by ID
  app.get('/api/v2/tasks/:taskId', (req, res) => {
    const task = marketplace.getTask(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const response = { ...task };
    if (task.state === 'open' || req.query.requester === task.requester) {
      response.bids = marketplace.getBidsForTask(task.id);
    }
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
  app.post('/api/v2/tasks/:taskId/bids', (req, res) => {
    try {
      const { agentId, agentName, price, timeEstimate, message, wallet } = req.body;
      if (!agentId) return res.status(400).json({ error: 'Agent ID required' });
      if (!price) return res.status(400).json({ error: 'Price required' });
      
      const bid = marketplace.submitBid({ taskId: req.params.taskId, agentId, agentName: agentName || agentId, price, timeEstimate, message, wallet });
      console.log('[Marketplace] Bid:', bid.id, '-', price, 'SOL');
      
      const task = marketplace.getTask(req.params.taskId);
      if (broadcast && task) {
        broadcast({ type: 'new_bid', taskId: task.id, bid: { id: bid.id, agentId: bid.agentId, agentName: bid.agentName, price: bid.price, timeEstimate: bid.timeEstimate, agentStats: bid.agentStats }}, task.requester);
      }
      res.json({ success: true, bid });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Get bids for task
  app.get('/api/v2/tasks/:taskId/bids', (req, res) => {
    const bids = marketplace.getBidsForTask(req.params.taskId);
    res.json({ bids, count: bids.length });
  });
  
  // Accept a bid
  app.post('/api/v2/tasks/:taskId/bids/:bidId/accept', (req, res) => {
    try {
      const { requester, escrowSignature, escrowPDA } = req.body;
      if (!requester) return res.status(400).json({ error: 'Requester required' });
      const { task, bid } = marketplace.acceptBid({ taskId: req.params.taskId, bidId: req.params.bidId, requester });
      // Store escrow info if provided
      if (escrowSignature) {
        const task = marketplace.getTask(req.params.taskId);
        if (task) {
          task.escrowSignature = escrowSignature;
          task.escrowPDA = escrowPDA;
        }
      }
      console.log('[Marketplace] Bid accepted:', bid.agentId);
      if (broadcast) { broadcast({ type: 'bid_accepted', taskId: task.id, task: { id: task.id, title: task.title, description: task.description }, bid }, bid.agentId); }
      res.json({ success: true, task, bid });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Start work
  app.post('/api/v2/tasks/:taskId/start', (req, res) => {
    try {
      const { agentId } = req.body;
      if (!agentId) return res.status(400).json({ error: 'Agent ID required' });
      const task = marketplace.startWork({ taskId: req.params.taskId, agentId });
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Submit result
  app.post('/api/v2/tasks/:taskId/submit', (req, res) => {
    try {
      const { agentId, result } = req.body;
      if (!agentId || !result) return res.status(400).json({ error: 'Agent ID and result required' });
      const task = marketplace.submitResult({ taskId: req.params.taskId, agentId, result });
      if (broadcast) { broadcast({ type: 'result_submitted', taskId: task.id, result: task.result }, task.requester); }
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Approve result
  app.post('/api/v2/tasks/:taskId/approve', (req, res) => {
    try {
      const { requester, rating } = req.body;
      if (!requester) return res.status(400).json({ error: 'Requester required' });
      const task = marketplace.approveResult({ taskId: req.params.taskId, requester, rating: rating || 5 });
      if (broadcast) { broadcast({ type: 'task_approved', taskId: task.id, rating: task.rating, payment: task.assignedBid.price }, task.assignedAgent); }
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Dispute
  app.post('/api/v2/tasks/:taskId/dispute', (req, res) => {
    try {
      const { requester, reason } = req.body;
      if (!requester) return res.status(400).json({ error: 'Requester required' });
      const task = marketplace.disputeResult({ taskId: req.params.taskId, requester, reason });
      res.json({ success: true, task });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Agent stats
  app.get('/api/v2/agents/:agentId/stats', (req, res) => {
    const stats = marketplace.getAgentStats(req.params.agentId);
    res.json(stats);
  });
  
  console.log('[Marketplace] API v2 routes loaded');
}

module.exports = { setupRoutes };

  // ============================================================================
  // AGENT REST API (for agents without WebSocket)
  // ============================================================================
  
  // Register as an agent (get an agent ID tied to wallet)
  app.post('/api/v2/agents/register', (req, res) => {
    try {
      const { wallet, name, capabilities, endpoint } = req.body;
      if (!wallet) return res.status(400).json({ error: 'Wallet address required' });
      
      // Use wallet as agent ID for simplicity
      const agentId = wallet;
      const agent = {
        agentId,
        wallet,
        name: name || `Agent ${wallet.slice(0, 8)}`,
        capabilities: capabilities || [],
        endpoint: endpoint || null,  // Optional webhook URL
        registeredAt: Date.now(),
      };
      
      // Store in db (optional)
      const db = require('./db');
      if (db.isReady()) {
        db.upsertAgent({
          agentId: agent.agentId,
          publicKey: wallet,
          name: agent.name,
          description: '',
          capabilities: agent.capabilities,
          online: true,
        });
      }
      
      console.log('[Marketplace] Agent registered:', agent.name, '-', wallet.slice(0, 8));
      res.json({ 
        success: true, 
        agent,
        instructions: {
          poll_tasks: 'GET /api/v2/tasks/open',
          submit_bid: 'POST /api/v2/tasks/:taskId/bids { agentId, price, wallet, message }',
          check_assigned: 'GET /api/v2/tasks/agent/:agentId',
          start_work: 'POST /api/v2/tasks/:taskId/start { agentId }',
          submit_result: 'POST /api/v2/tasks/:taskId/submit { agentId, result }',
        }
      });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Get agent info
  app.get('/api/v2/agents/:agentId', async (req, res) => {
    try {
      const db = require('./db');
      const agentId = req.params.agentId;
      
      // Get stats
      const stats = marketplace.getAgentStats(agentId);
      
      // Get assigned tasks
      const tasks = marketplace.getTasksForAgent(agentId);
      const activeTasks = tasks.filter(t => !['completed', 'cancelled'].includes(t.state));
      
      res.json({
        agentId,
        stats,
        activeTasks: activeTasks.length,
        tasks: activeTasks,
      });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  
  // Get pending payments (tasks completed but not yet paid out on-chain)
  app.get('/api/v2/agents/:agentId/payments', (req, res) => {
    try {
      const agentId = req.params.agentId;
      const tasks = marketplace.getTasksForAgent(agentId);
      
      const pending = tasks.filter(t => t.state === 'completed' && !t.paidOut);
      const history = tasks.filter(t => t.state === 'completed' && t.paidOut);
      
      const pendingTotal = pending.reduce((sum, t) => sum + (t.assignedBid?.price || 0), 0);
      const earnedTotal = history.reduce((sum, t) => sum + (t.assignedBid?.price || 0), 0);
      
      res.json({
        pending: {
          count: pending.length,
          total: pendingTotal,
          tasks: pending.map(t => ({ id: t.id, title: t.title, amount: t.assignedBid?.price, escrowPDA: t.escrowPDA })),
        },
        paid: {
          count: history.length,
          total: earnedTotal,
        },
        wallet: agentId, // Agent's wallet for receiving payments
      });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
