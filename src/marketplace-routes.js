/**
 * Marketplace API Routes
 */

const marketplace = require('./marketplace');
const db = require('./db');
const { requireAdmin } = require('./auth');


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
      
      if (broadcast) { console.log('[Broadcast] new_task to all agents:', task.id); broadcast({ type: 'new_task', task }); }
      
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
      const { agentId, price, timeEstimate, message, wallet } = req.body;
      let { agentName } = req.body;
      if (!agentName || agentName === agentId) {
        try { const a = await db.getAgent(agentId); if (a) agentName = a.name; } catch(e) {}
      }
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
      console.log('[Marketplace] Bid accepted for', task.assignedAgent);
      // Send task details to assigned agent
      if (broadcast) {
        // Broadcast to all for UI updates
        broadcast({ type: 'bid_accepted', taskId: task.id, agentId: task.assignedAgent });
        // Notify winning agent
        broadcast({ type: 'task_assigned', taskId: task.id, task: task }, task.assignedAgent);
        
        // Send full task details directly to the assigned agent
        broadcast({
          type: 'task_assigned',
          taskId: task.id,
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            maxBudget: task.maxBudget,
            requester: task.requester,
            attachments: task.attachments || []
          }
        }, task.assignedAgent);
        console.log('[Marketplace] Sent task_assigned to', task.assignedAgent);
      }
      
      // Auto-trigger work for built-in bots
      const bots = require('./bots');
      if (bots.getBotIds().includes(task.assignedAgent)) {
        console.log('[Marketplace] Auto-triggering built-in bot:', task.assignedAgent);
        setImmediate(async () => {
          try {
            // Start work
            await marketplace.startWork(task.id, task.assignedAgent);
            
            // Do the work
            const result = await bots.handleTask(task.assignedAgent, {
              title: task.title,
              description: task.description
            });
            
            // Submit result
            if (result.success) {
              await marketplace.submitResult(task.id, task.assignedAgent, result.result);
              console.log('[Marketplace] Bot completed task:', task.id);
              if (broadcast) broadcast({ type: 'task_result', taskId: task.id, result: result.result });
            }
          } catch (e) {
            console.error('[Marketplace] Bot work failed:', e.message);
          }
        });
      }
      
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
      if (!agentId) return res.status(400).json({ error: 'Agent ID required' });
      if (!attachments || attachments.length === 0) return res.status(400).json({ error: 'At least one file attachment is required for deliverables' });
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
  
  // Cancel task (before bid accepted)
  app.post('/api/v2/tasks/:taskId/cancel', async (req, res) => {
    try {
      const { requester } = req.body;
      if (!requester) return res.status(400).json({ error: 'Requester required' });
      const task = await marketplace.cancelTask(req.params.taskId, requester);
      if (broadcast) broadcast({ type: 'task_cancelled', taskId: task.id });
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

  // ==================== CHAT ====================
  
  // Helper: Check if user can access chat
  async function canAccessChat(taskId, userId) {
    // Try DB first, then memory
    let task = await db.getTaskById(taskId);
    if (!task) task = marketplace.tasks.get(taskId);
    if (!task) return { allowed: false, reason: 'Task not found' };
    
    // Normalize field names (DB uses snake_case, memory uses camelCase)
    const state = task.state || task.status || 'open';
    const requesterId = task.requester_id || task.requesterId || task.requester;
    const assignedAgent = task.assigned_agent || task.assignedAgent;
    
    // Chat opens after bid accepted (assigned, in_progress, submitted, completed)
    const chatStates = ['assigned', 'in_progress', 'submitted', 'completed'];
    if (!chatStates.includes(state)) {
      return { allowed: false, reason: 'Chat opens after bid is accepted', task, state };
    }
    
    // Only task creator or assigned agent can access
    const isCreator = requesterId === userId;
    const isAgent = assignedAgent === userId || (assignedAgent && userId && (assignedAgent.startsWith(userId) || userId.startsWith(assignedAgent)));
    
    if (!isCreator && !isAgent) {
      return { allowed: false, reason: 'Only task creator and assigned agent can chat', task, state };
    }
    
    // Can only send messages if task is active (not completed)
    const canSend = ['assigned', 'in_progress', 'submitted'].includes(state);
    
    return { allowed: true, task, state, canSend };
  }
  
  // Get messages for a task
  app.get("/api/v2/tasks/:taskId/messages", async (req, res) => {
    try {
      const userId = req.query.userId;
      const access = await canAccessChat(req.params.taskId, userId);
      
      if (!access.allowed) {
        return res.json({ 
          messages: [], 
          locked: true, 
          reason: access.reason,
          status: access.task?.status 
        });
      }
      
      const messages = await db.getMessages(req.params.taskId);
      res.json({ 
        messages, 
        locked: false,
        readOnly: !access.canSend,
        status: access.task?.status
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Post a message
  app.post("/api/v2/tasks/:taskId/messages", async (req, res) => {
    try {
      const { senderId, senderName, message } = req.body;
      
      if (!senderId || !message) {
        return res.status(400).json({ error: "senderId and message required" });
      }
      
      // Check access
      const access = await canAccessChat(req.params.taskId, senderId);
      
      if (!access.allowed) {
        return res.status(403).json({ error: access.reason });
      }
      
      if (!access.canSend) {
        return res.status(403).json({ error: "Chat is closed - task completed" });
      }
      
      const saved = await db.saveMessage(
        req.params.taskId,
        senderId,
        senderName || senderId.slice(0, 8),
        message
      );
      
      // Broadcast to WebSocket clients watching this task
      if (broadcast) {
        broadcast({ 
          type: 'chat_message', 
          taskId: req.params.taskId,
          message: saved
        });
      }
      
      res.json({ success: true, message: saved });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==================== RATINGS ====================
  
  // Submit a rating for a completed task
  app.post("/api/v2/tasks/:taskId/rate", async (req, res) => {
    try {
      const { raterId, rating, review } = req.body;
      const taskId = req.params.taskId;
      
      if (!raterId || !rating) {
        return res.status(400).json({ error: "raterId and rating required" });
      }
      
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be 1-5" });
      }
      
      // Get task to validate
      let task = await db.getTaskById(taskId);
      if (!task) task = marketplace.tasks.get(taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      const state = task.state || task.status;
      if (state !== 'completed') {
        return res.status(400).json({ error: "Can only rate completed tasks" });
      }
      
      // Only task creator can rate the agent
      const requesterId = task.requester_id || task.requesterId || task.requester;
      const assignedAgent = task.assigned_agent || task.assignedAgent;
      
      if (raterId !== requesterId) {
        return res.status(403).json({ error: "Only task creator can rate" });
      }
      
      const rateeId = assignedAgent;
      const raterRole = 'requester';
      
      // Check if already rated
      const alreadyRated = await db.hasUserRatedTask(taskId, raterId);
      if (alreadyRated) {
        return res.status(400).json({ error: "You have already rated this task" });
      }
      
      const saved = await db.saveRating(taskId, raterId, rateeId, rating, review || null, raterRole);
      
      res.json({ success: true, rating: saved });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  
  // Get ratings for a task
  app.get("/api/v2/tasks/:taskId/ratings", async (req, res) => {
    try {
      const ratings = await db.getRatingsForTask(req.params.taskId);
      res.json({ ratings });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  
  // Get ratings for a user/agent
  app.get("/api/v2/users/:userId/ratings", async (req, res) => {
    try {
      const ratings = await db.getRatingsForUser(req.params.userId);
      const stats = await db.getAverageRating(req.params.userId);
      res.json({ ratings, stats });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  
  // Get average rating for a user (lightweight)
  app.get("/api/v2/users/:userId/rating", async (req, res) => {
    try {
      const stats = await db.getAverageRating(req.params.userId);
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==================== DISPUTE RESOLUTION ====================
  
  // Get disputed tasks for review
  app.get('/api/v2/disputes', async (req, res) => {
    try {
      const allTasks = marketplace.getAllTasks();
      const disputed = allTasks.filter(t => t.state === 'disputed');
      
      // Enrich with chat history
      const enriched = await Promise.all(disputed.map(async (task) => {
        const messages = await db.getMessages(task.id);
        return {
          ...task,
          chatHistory: messages,
          disputeInfo: {
            requester: task.requester,
            agent: task.assignedAgent,
            agentWallet: task.assignedBid?.wallet,
            amount: task.assignedBid?.price || task.maxBudget,
            result: task.result,
            disputeReason: task.disputeReason
          }
        };
      }));
      
      res.json({ disputes: enriched, count: enriched.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  
  // Record arbitrator decision (pending approval)
  app.post('/api/v2/disputes/:taskId/decide', async (req, res) => {
    try {
      const { decision, reasoning, arbitratorId } = req.body;
      
      if (!['refund', 'release'].includes(decision)) {
        return res.status(400).json({ error: 'Decision must be "refund" or "release"' });
      }
      
      const task = marketplace.getTask(req.params.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.state !== 'disputed') return res.status(400).json({ error: 'Task not in disputed state' });
      
      // Store pending decision
      task.pendingDecision = {
        decision,
        reasoning,
        arbitratorId: arbitratorId || 'diddy',
        createdAt: Date.now(),
        approved: false
      };
      
      await db.saveTask(task);
      
      res.json({ 
        success: true, 
        message: 'Decision recorded. Awaiting human approval.',
        task 
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  
  // Human approves arbitrator decision
  app.post('/api/v2/disputes/:taskId/approve', async (req, res) => {
    try {
      const { approved, approverWallet } = req.body;
      
      const task = marketplace.getTask(req.params.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (!task.pendingDecision) return res.status(400).json({ error: 'No pending decision' });
      
      if (approved) {
        task.pendingDecision.approved = true;
        task.pendingDecision.approvedBy = approverWallet;
        task.pendingDecision.approvedAt = Date.now();
        
        // Mark ready for execution
        task.resolutionReady = true;
        task.resolutionDecision = task.pendingDecision.decision;
      } else {
        // Rejected - clear pending decision
        task.pendingDecision = null;
      }
      
      await db.saveTask(task);
      
      res.json({ 
        success: true, 
        approved,
        message: approved ? 'Decision approved. Ready for on-chain execution.' : 'Decision rejected.',
        task
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: Kick all connected agents
  app.post('/api/admin/kick-all', (req, res) => {
    const kicked = [];
    if (global.connections) {
      global.connections.forEach((ws, agentId) => {
        try {
          ws.close(1000, 'Kicked by admin');
          kicked.push(agentId);
        } catch (e) {}
      });

  // Clear all in-memory tasks
  app.post('/api/admin/clear-tasks', (req, res) => {
    const marketplace = require('./src/marketplace');
    marketplace.clearAllTasks();
    res.json({ success: true, message: 'In-memory tasks cleared' });
  });
      global.connections.clear();
    }
    if (global.agents) {
      global.agents.clear();
    }
    if (global.agentCapabilities) {
      global.agentCapabilities.clear();
    }
    res.json({ success: true, kicked, message: `Kicked ${kicked.length} agents` });
  });


  // ==================== ATTACHMENT UPLOADS (DB-backed) ====================
  
  // Upload attachment - stores in PostgreSQL
  app.post('/api/v2/attachments/upload', async (req, res) => {
    try {
      const { name, data, type, taskId, agentId } = req.body;
      
      if (!name || !data) {
        return res.status(400).json({ error: 'name and data (base64) required' });
      }
      
      // Validate base64
      const dataSize = Buffer.from(data, 'base64').length;
      
      // Limit: 5MB
      if (dataSize > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large (max 5MB)' });
      }
      
      // Generate unique ID
      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      // Save to database
      await db.saveAttachment({
        id,
        name,
        type: type || 'application/octet-stream',
        size: dataSize,
        data,
        taskId: taskId || null,
        agentId: agentId || null,
        createdAt: Date.now()
      });
      
      const url = `https://api.blissnexus.ai/api/v2/attachments/${id}`;
      
      res.json({ 
        success: true, 
        id,
        name,
        url,
        size: dataSize,
        type: type || 'application/octet-stream'
      });
    } catch (e) {
      console.error('[Attachments] Upload failed:', e);
      res.status(500).json({ error: e.message });
    }
  });
  
  // Download attachment
  app.get('/api/v2/attachments/:id', async (req, res) => {
    try {
      const att = await db.getAttachment(req.params.id);
      
      if (!att) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      
      // Decode base64 and send
      const buffer = Buffer.from(att.data, 'base64');
      res.setHeader('Content-Type', att.type);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="${att.name}"`);
      res.send(buffer);
    } catch (e) {
      console.error('[Attachments] Download failed:', e);
      res.status(500).json({ error: e.message });
    }
  });
  
  // List attachments for a task
  app.get('/api/v2/tasks/:taskId/attachments', async (req, res) => {
    try {
      const attachments = await db.getTaskAttachments(req.params.taskId);
      res.json({ 
        attachments: attachments.map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          size: a.size,
          url: `https://api.blissnexus.ai/api/v2/attachments/${a.id}`,
          createdAt: a.created_at
        })),
        count: attachments.length 
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { setupRoutes };
