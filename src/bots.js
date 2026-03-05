/**
 * Built-in Bots - DISABLED
 * External agents handle all tasks
 */

function getBotProfiles() {
  return []; // No built-in bots
}

function getBotIds() {
  return [];
}

async function handleTask(agentId, task) {
  return { error: 'No built-in bots' };
}

module.exports = { getBotProfiles, getBotIds, handleTask };
