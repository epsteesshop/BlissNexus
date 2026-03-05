/**
 * BlissNexus Advanced Monitoring
 * Now with persistent stats via database
 */

const db = require('./db');

// In-memory stats (for request tracking - resets on restart)
const memStats = {
  startedAt: Date.now(),
  requests: 0,
  errors: 0,
  wsConnections: 0,
  peakWs: 0,
  endpoints: {},
  lastError: null
};

// Cached persistent stats (loaded from DB)
let persistentStats = {
  tasksCompleted: 0,
  tasksFailed: 0,
  solPaid: 0
};

// Load stats from DB on startup
async function loadStats() {
  try {
    const stats = await db.getStats();
    persistentStats.tasksCompleted = stats.tasks_completed || 0;
    persistentStats.tasksFailed = stats.tasks_failed || 0;
    persistentStats.solPaid = stats.sol_paid || 0;
    console.log('[Monitor] Loaded persistent stats:', persistentStats);
  } catch (e) {
    console.error('[Monitor] Failed to load stats:', e.message);
  }
}

function track(req, res, next) {
  memStats.requests++;
  const key = `${req.method} ${req.path}`;
  memStats.endpoints[key] = (memStats.endpoints[key] || 0) + 1;
  next();
}

function trackError(err) {
  memStats.errors++;
  memStats.lastError = { msg: err.message, time: Date.now() };
}

function trackWsConnect() {
  memStats.wsConnections++;
  if (memStats.wsConnections > memStats.peakWs) memStats.peakWs = memStats.wsConnections;
}

function trackWsDisconnect() {
  memStats.wsConnections = Math.max(0, memStats.wsConnections - 1);
}

async function trackTask(success) {
  if (success) {
    persistentStats.tasksCompleted++;
    await db.incrementStat('tasks_completed', 1);
  } else {
    persistentStats.tasksFailed++;
    await db.incrementStat('tasks_failed', 1);
  }
}

async function trackPayment(amount) {
  // Store as micro-SOL (multiply by 1M) to avoid float precision issues
  const microSol = Math.round(amount * 1000000);
  persistentStats.solPaid += microSol;
  await db.incrementStat('sol_paid', microSol);
}

function getUptime() {
  const s = Math.floor((Date.now() - memStats.startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m ${s % 60}s`;
}

function getStatus() {
  return {
    uptime: getUptime(),
    requests: {
      total: memStats.requests,
      errors: memStats.errors,
      errorRate: memStats.requests ? (memStats.errors / memStats.requests * 100).toFixed(2) + '%' : '0%'
    },
    websockets: {
      current: memStats.wsConnections,
      peak: memStats.peakWs
    },
    tasks: {
      completed: persistentStats.tasksCompleted,
      failed: persistentStats.tasksFailed
    },
    payments: {
      totalSol: (persistentStats.solPaid / 1000000).toFixed(6)
    },
    topEndpoints: Object.entries(memStats.endpoints)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    lastError: memStats.lastError
  };
}

function healthCheck() {
  const errorRate = memStats.requests ? memStats.errors / memStats.requests : 0;
  const healthy = errorRate < 0.1;
  return {
    healthy,
    status: healthy ? 'All systems operational' : 'Issues detected',
    checks: {
      errorRate: errorRate < 0.1 ? 'OK' : 'HIGH',
      wsConnections: memStats.wsConnections < 1000 ? 'OK' : 'HIGH'
    }
  };
}

module.exports = { 
  loadStats,
  track, 
  trackError, 
  trackWsConnect, 
  trackWsDisconnect, 
  trackTask, 
  trackPayment, 
  getStatus, 
  healthCheck 
};
