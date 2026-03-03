/**
 * BlissNexus Advanced Monitoring
 */

const stats = {
  startedAt: Date.now(),
  requests: 0,
  errors: 0,
  wsConnections: 0,
  peakWs: 0,
  tasksCompleted: 0,
  tasksFailed: 0,
  solPaid: 0,
  endpoints: {}
};

function track(req, res, next) {
  stats.requests++;
  const key = `${req.method} ${req.path}`;
  stats.endpoints[key] = (stats.endpoints[key] || 0) + 1;
  next();
}

function trackError(err) {
  stats.errors++;
  stats.lastError = { msg: err.message, time: Date.now() };
}

function trackWsConnect() {
  stats.wsConnections++;
  if (stats.wsConnections > stats.peakWs) stats.peakWs = stats.wsConnections;
}

function trackWsDisconnect() {
  stats.wsConnections = Math.max(0, stats.wsConnections - 1);
}

function trackTask(success) {
  if (success) stats.tasksCompleted++;
  else stats.tasksFailed++;
}

function trackPayment(amount) {
  stats.solPaid += amount;
}

function getUptime() {
  const s = Math.floor((Date.now() - stats.startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m ${s % 60}s`;
}

function getStatus() {
  return {
    uptime: getUptime(),
    requests: {
      total: stats.requests,
      errors: stats.errors,
      errorRate: stats.requests ? (stats.errors / stats.requests * 100).toFixed(2) + '%' : '0%'
    },
    websockets: {
      current: stats.wsConnections,
      peak: stats.peakWs
    },
    tasks: {
      completed: stats.tasksCompleted,
      failed: stats.tasksFailed
    },
    payments: {
      totalSol: stats.solPaid.toFixed(6)
    },
    topEndpoints: Object.entries(stats.endpoints)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    lastError: stats.lastError || null
  };
}

function healthCheck() {
  const errorRate = stats.requests ? stats.errors / stats.requests : 0;
  const healthy = errorRate < 0.1;
  return {
    healthy,
    status: healthy ? 'All systems operational' : 'Issues detected',
    checks: {
      errorRate: errorRate < 0.1 ? 'OK' : 'HIGH',
      wsConnections: stats.wsConnections < 1000 ? 'OK' : 'HIGH'
    }
  };
}

module.exports = { 
  track, trackError, trackWsConnect, trackWsDisconnect, 
  trackTask, trackPayment, getStatus, healthCheck 
};
