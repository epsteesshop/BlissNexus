/**
 * Automatic settlement - batch payments hourly
 */

const SETTLEMENT_INTERVAL = parseInt(process.env.SETTLEMENT_INTERVAL_MS) || 60 * 60 * 1000; // 1 hour
const MIN_PAYOUT = parseFloat(process.env.MIN_PAYOUT_SOL) || 0.001;

const pendingPayments = new Map(); // agentPubkey -> { amount, taskIds }

function recordPending(agentPubkey, amount, taskId) {
  const existing = pendingPayments.get(agentPubkey) || { amount: 0, taskIds: [] };
  existing.amount += amount;
  existing.taskIds.push(taskId);
  pendingPayments.set(agentPubkey, existing);
  console.log('[Settlement] Pending:', agentPubkey.slice(0,8), '+', amount, '= total', existing.amount);
}

async function runSettlement(solana) {
  const results = [];
  for (const [pubkey, data] of pendingPayments) {
    if (data.amount >= MIN_PAYOUT) {
      const result = await solana.payAgent(pubkey, data.amount);
      results.push({ pubkey, amount: data.amount, ...result });
      if (result.success) {
        pendingPayments.delete(pubkey);
      }
    }
  }
  console.log('[Settlement] Settled', results.length, 'payments');
  return results;
}

function getPending() {
  return Array.from(pendingPayments.entries()).map(([pubkey, data]) => ({
    pubkey,
    amount: data.amount,
    tasks: data.taskIds.length
  }));
}

function getStats() {
  const pending = getPending();
  return {
    pendingPayments: pending.length,
    pendingAmount: pending.reduce((s, p) => s + p.amount, 0),
    minPayout: MIN_PAYOUT,
    intervalMs: SETTLEMENT_INTERVAL
  };
}

let intervalId = null;
function start(solana) {
  if (intervalId) return;
  intervalId = setInterval(() => runSettlement(solana), SETTLEMENT_INTERVAL);
  console.log('[Settlement] Started, interval:', SETTLEMENT_INTERVAL / 1000, 's');
}

module.exports = { recordPending, runSettlement, getPending, getStats, start };
