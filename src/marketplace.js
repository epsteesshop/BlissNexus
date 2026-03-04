/**
 * BlissNexus Marketplace - Competitive Bidding System
 */

// In-memory stores (will move to Redis/DB later)
const tasks = new Map();
const bids = new Map();  // taskId -> [bids]
const agentStats = new Map();  // agentId -> stats

// Task states
const TaskState = {
  OPEN: 'open',           // Accepting bids
  ASSIGNED: 'assigned',   // Bid selected, awaiting work
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted', // Work submitted, awaiting approval
  COMPLETED: 'completed', // Approved, payment released
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
};

// Create a new task (open for bidding)
function createTask({ title, description, maxBudget, deadline, requester, capabilities }) {
  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  
  const task = {
    id: taskId,
    title,
    description: description || '',
    maxBudget: parseFloat(maxBudget) || 1.0,  // Max SOL willing to pay
    deadline: deadline || null,  // ISO timestamp or null
    capabilities: capabilities || [],  // Required skills
    requester,  // Wallet address
    state: TaskState.OPEN,
    assignedAgent: null,
    assignedBid: null,
    result: null,
    escrowTx: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  tasks.set(taskId, task);
  bids.set(taskId, []);
  
  return task;
}

// Submit a bid on a task
function submitBid({ taskId, agentId, agentName, price, timeEstimate, message, wallet }) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.state !== TaskState.OPEN) throw new Error('Task not accepting bids');
  if (price > task.maxBudget) throw new Error('Bid exceeds max budget');
  
  const bidId = 'bid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  
  const bid = {
    id: bidId,
    taskId,
    agentId,
    agentName,
    price: parseFloat(price),
    timeEstimate,  // e.g., "2 hours", "1 day"
    message,  // Agent's pitch
    wallet,   // Agent's payment wallet
    status: 'pending',
    createdAt: Date.now(),
  };
  
  // Get agent stats for reputation
  const stats = agentStats.get(agentId) || { completed: 0, rating: 0, totalEarned: 0 };
  bid.agentStats = stats;
  
  const taskBids = bids.get(taskId) || [];
  
  // Check if agent already bid
  const existingBid = taskBids.find(b => b.agentId === agentId);
  if (existingBid) {
    // Update existing bid
    Object.assign(existingBid, { price, timeEstimate, message, updatedAt: Date.now() });
    return existingBid;
  }
  
  taskBids.push(bid);
  bids.set(taskId, taskBids);
  
  return bid;
}

// Get all bids for a task
function getBids(taskId) {
  return bids.get(taskId) || [];
}

// Accept a bid (requester selects winner)
function acceptBid({ taskId, bidId, requester }) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.requester !== requester) throw new Error('Not task owner');
  if (task.state !== TaskState.OPEN) throw new Error('Task not open for bidding');
  
  const taskBids = bids.get(taskId) || [];
  const bid = taskBids.find(b => b.id === bidId);
  if (!bid) throw new Error('Bid not found');
  
  // Update task
  task.state = TaskState.ASSIGNED;
  task.assignedAgent = bid.agentId;
  task.assignedBid = bid;
  task.escrowPDA = null;
  task.escrowSignature = null;
  task.updatedAt = Date.now();
  
  // Update bid statuses
  taskBids.forEach(b => {
    b.status = b.id === bidId ? 'accepted' : 'rejected';
  });
  
  tasks.set(taskId, task);
  
  return { task, bid };
}

// Agent starts working
function startWork({ taskId, agentId }) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.assignedAgent !== agentId) throw new Error('Not assigned to this agent');
  if (task.state !== TaskState.ASSIGNED) throw new Error('Task not in assigned state');
  
  task.state = TaskState.IN_PROGRESS;
  task.startedAt = Date.now();
  task.updatedAt = Date.now();
  tasks.set(taskId, task);
  
  return task;
}

// Agent submits result
function submitResult({ taskId, agentId, result }) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.assignedAgent !== agentId) throw new Error('Not assigned to this agent');
  if (task.state !== TaskState.IN_PROGRESS && task.state !== TaskState.ASSIGNED) {
    throw new Error('Task not in progress');
  }
  
  task.state = TaskState.SUBMITTED;
  task.result = result;
  task.submittedAt = Date.now();
  task.updatedAt = Date.now();
  tasks.set(taskId, task);
  
  return task;
}

// Requester approves result (triggers payment)
function approveResult({ taskId, requester, rating }) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.requester !== requester) throw new Error('Not task owner');
  if (task.state !== TaskState.SUBMITTED) throw new Error('No result to approve');
  
  task.state = TaskState.COMPLETED;
  task.completedAt = Date.now();
  task.rating = rating || 5;
  task.updatedAt = Date.now();
  tasks.set(taskId, task);
  
  // Update agent stats
  const agentId = task.assignedAgent;
  const stats = agentStats.get(agentId) || { completed: 0, rating: 0, totalRatings: 0, totalEarned: 0 };
  stats.completed += 1;
  stats.totalRatings += 1;
  stats.rating = ((stats.rating * (stats.totalRatings - 1)) + task.rating) / stats.totalRatings;
  stats.totalEarned += task.assignedBid.price;
  agentStats.set(agentId, stats);
  
  return task;
}

// Dispute a result
function disputeResult({ taskId, requester, reason }) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.requester !== requester) throw new Error('Not task owner');
  if (task.state !== TaskState.SUBMITTED) throw new Error('No result to dispute');
  
  task.state = TaskState.DISPUTED;
  task.disputeReason = reason;
  task.disputedAt = Date.now();
  task.updatedAt = Date.now();
  tasks.set(taskId, task);
  
  return task;
}

// Get open tasks (for agents to browse)
function getOpenTasks({ capabilities, limit = 50 } = {}) {
  let result = Array.from(tasks.values())
    .filter(t => t.state === TaskState.OPEN);
  
  if (capabilities && capabilities.length > 0) {
    result = result.filter(t => 
      t.capabilities.length === 0 || 
      t.capabilities.some(c => capabilities.includes(c))
    );
  }
  
  return result
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

// Get task by ID
function getTask(taskId) {
  return tasks.get(taskId);
}

// Get tasks by requester
function getTasksByRequester(requester) {
  return Array.from(tasks.values())
    .filter(t => t.requester === requester)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Get tasks assigned to agent
function getTasksByAgent(agentId) {
  return Array.from(tasks.values())
    .filter(t => t.assignedAgent === agentId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Get agent stats
function getAgentStats(agentId) {
  return agentStats.get(agentId) || { completed: 0, rating: 0, totalRatings: 0, totalEarned: 0 };
}

module.exports = {
  TaskState,
  createTask,
  submitBid,
  getBids,
  acceptBid,
  startWork,
  submitResult,
  approveResult,
  disputeResult,
  getOpenTasks,
  getTask,
  getTasksByRequester,
  getTasksByAgent,
  getAgentStats,
};
