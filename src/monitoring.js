const stats = {
  startedAt: Date.now(),
  requests: 0,
  errors: 0
};

function track(req, res, next) {
  stats.requests++;
  next();
}

function getStatus() {
  const uptime = Math.floor((Date.now() - stats.startedAt) / 1000);
  return {
    uptime: `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m`,
    requests: stats.requests,
    errors: stats.errors
  };
}

module.exports = { track, getStatus };
