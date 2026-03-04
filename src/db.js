/**
 * BlissNexus Database Layer
 * Currently running in memory-only mode due to Railway networking issues
 */

let dbReady = false;
let lastError = 'Railway internal networking not available - running in memory mode';

console.log('[DB] Running in memory mode (no persistence)');

async function initDB() {
  // Skip DB for now - Railway TCP proxy not working
  console.log('[DB] Skipping - Railway networking issue');
  return { success: false, error: lastError };
}

function isReady() { return false; }
function getLastError() { return lastError; }
function getConnectionUrl() { return 'MEMORY_MODE'; }

// All DB functions return null/empty - marketplace will use in-memory fallback
async function query() { return null; }
async function upsertAgent() { return null; }
async function setAgentOnline() { }
async function getAllAgents() { return []; }
async function saveTask() { return null; }
async function getAllTasks() { return []; }
async function getOpenTasks() { return []; }
async function saveBid() { return null; }
async function getBidsForTask() { return []; }
async function getAgentStats() { return { completed: 0, rating: 0, totalEarned: 0 }; }
async function updateAgentStats() { }

module.exports = {
  initDB, isReady, getLastError, getConnectionUrl, query,
  upsertAgent, setAgentOnline, getAllAgents,
  saveTask, getAllTasks, getOpenTasks,
  saveBid, getBidsForTask,
  getAgentStats, updateAgentStats
};
