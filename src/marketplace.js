/**
 * BlissNexus Marketplace - Competitive Bidding System
 * Now with PostgreSQL persistence
 */

const db = require('./db');

// In-memory cache (synced with DB)
const tasks = new Map();
const bids = new Map();  // taskId -> [bids]
const agentStats = new Map();  // agentId -> stats

// Task states
// Parse deadline like "24h", "7d", or null
function parseDeadline(d) {
  if (!d) return null;
  const match = d.match(/^(\d+)(h|d|m)$/);
  if (!match) return null;
  const [, num, unit] = match;
  const ms = unit === "h" ? num * 3600000 : unit === "d" ? num * 86400000 : num * 60000;
  return new Date(Date.now() + parseInt(ms)).toISOString();
}

const TaskState = {
  OPEN: 'open',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
};

// Initialize - load tasks from DB
async function init() {
  if (!db.isReady()) {
    console.log('[Marketplace] Running without persistence (no DB)');
    return;
  }
  
  try {
    // Load all tasks
    const dbTasks = await db.getAllTasks();
    for (const task of dbTasks) {
      tasks.set(task.id, task);
      // Load bids for each task
      const taskBids = await db.getBidsForTask(task.id);
      bids.set(task.id, taskBids);
    }
    console.log(`[Marketplace] Loaded ${tasks.size} tasks from database`);
  } catch (e) {
    console.error('[Marketplace] Failed to load from DB:', e.message);
  }
}

// Create a new task
async function createTask({ title, description, maxBudget, deadline, requester, capabilities }) {
  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  
  const task = {
    id: taskId,
    title,
    description: description || '',
    maxBudget: parseFloat(maxBudget) || 1.0,
    deadline: parseDeadline(deadline),
    capabilities: capabilities || [],
    requester,
    state: TaskState.OPEN,
    assignedAgent: null,
    assignedBid: null,
    result: null,
    escrowTx: null,
    escrowPDA: null,
    escrowSignature: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  tasks.set(taskId, task);
  bids.set(taskId, []);
  
  // Persist to DB
  await db.saveTask(task);
  
  return task;
}

// Submit a bid on a task
async function submitBid({ taskId, agentId, agentName, price, timeEstimate, message, wallet }) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.state !== TaskState.OPEN) throw new Error('Task not accepting bids');
  if (price > task.maxBudget) throw new Error('Bid exceeds max budget');
  
  const bidId = 'bid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  
  const bid = {
    id: bidId,
    taskId,
    agentId,
    agentName: agentName || agentId.slice(0, 8),
    price: parseFloat(price),
    timeEstimate: timeEstimate || 'Not specified',
    message: message || '',
    wallet: wallet || agentId,
    status: 'pending',
    createdAt: Date.now(),
  };
  
  const taskBids = bids.get(taskId) || [];
  taskBids.push(bid);
  bids.set(taskId, taskBids);
  
  // Persist to DB
  await db.saveBid(bid);
  
  return bid;
}

// Accept a bid
async function acceptBid(taskId, bidId, requester) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.requester !== requester) throw new Error('Not authorized');
  if (task.state !== TaskState.OPEN) throw new Error('Task not open');
  
  const taskBids = bids.get(taskId) || [];
  const bid = taskBids.find(b => b.id === bidId);
  if (!bid) throw new Error('Bid not found');
  
  // Update bid status
  bid.status = 'accepted';
  taskBids.forEach(b => {
    if (b.id !== bidId) b.status = 'rejected';
  });
  
  // Update task
  task.state = TaskState.ASSIGNED;
  task.assignedAgent = bid.agentId;
  task.assignedBid = bid;
  task.updatedAt = Date.now();
  
  // Persist
  await db.saveTask(task);
  await db.saveBid(bid);
  
  return task;
}

// Start working on task
async function startWork(taskId, agentId) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.assignedAgent !== agentId) throw new Error('Not assigned to you');
  if (task.state !== TaskState.ASSIGNED) throw new Error('Task not in assigned state');
  
  task.state = TaskState.IN_PROGRESS;
  task.updatedAt = Date.now();
  
  await db.saveTask(task);
  return task;
}

// Submit result
async function submitResult(taskId, agentId, result) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.assignedAgent !== agentId) throw new Error('Not assigned to you');
  if (task.state !== TaskState.IN_PROGRESS) throw new Error('Task not in progress');
  
  task.state = TaskState.SUBMITTED;
  task.result = result;
  task.updatedAt = Date.now();
  
  await db.saveTask(task);
  return task;
}

// Approve result
async function approveResult(taskId, requester, rating = 5) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.requester !== requester) throw new Error('Not authorized');
  if (task.state !== TaskState.SUBMITTED) throw new Error('No result to approve');
  
  task.state = TaskState.COMPLETED;
  task.updatedAt = Date.now();
  
  // Update agent stats
  const agentId = task.assignedAgent;
  const stats = agentStats.get(agentId) || { completed: 0, rating: 0, totalEarned: 0 };
  stats.completed++;
  stats.totalEarned += task.assignedBid?.price || 0;
  stats.rating = ((stats.rating * (stats.completed - 1)) + rating) / stats.completed;
  agentStats.set(agentId, stats);
  
  // Persist
  await db.saveTask(task);
  await db.updateAgentStats(agentId, stats);
  
  return task;
}

// Dispute result
async function disputeResult(taskId, requester, reason) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.requester !== requester) throw new Error('Not authorized');
  
  task.state = TaskState.DISPUTED;
  task.disputeReason = reason;
  task.updatedAt = Date.now();
  
  await db.saveTask(task);
  return task;
}

// Getters
function getTask(taskId) {
  return tasks.get(taskId) || null;
}

function getOpenTasks() {
  return Array.from(tasks.values()).filter(t => t.state === TaskState.OPEN);
}

function getTasksForRequester(requester) {
  return Array.from(tasks.values()).filter(t => t.requester === requester);
}

function getTasksForAgent(agentId) {
  return Array.from(tasks.values()).filter(t => t.assignedAgent === agentId);
}

function getBidsForTask(taskId) {
  return bids.get(taskId) || [];
}

function getAgentStats(agentId) {
  return agentStats.get(agentId) || { completed: 0, rating: 0, totalEarned: 0 };
}

// For broadcasting
let broadcastFn = null;
function setBroadcastFunction(fn) { broadcastFn = fn; }
function broadcast(event, data) {
  if (broadcastFn) broadcastFn(event, data);
}

module.exports = {
  init,
  TaskState,
  createTask,
  submitBid,
  acceptBid,
  startWork,
  submitResult,
  approveResult,
  disputeResult,
  getTask,
  getOpenTasks,
  getTasksForRequester,
  getTasksForAgent,
  getBidsForTask,
  getAgentStats,
  setBroadcastFunction,
  broadcast,
};
