/**
 * Auto-bidding for built-in bots
 */

const bots = require('./bots');

async function autoBidFromBots(task, marketplace) {
  const botProfiles = bots.getBotProfiles();
  
  for (const bot of botProfiles) {
    // Check if bot has matching capabilities
    const hasCapability = !task.capabilities.length || task.capabilities.some(cap => 
      bot.capabilities.includes(cap) || bot.capabilities.includes('general')
    );
    
    if (hasCapability) {
      // Generate a competitive bid (slight randomness)
      const baseBid = task.maxBudget * (0.6 + Math.random() * 0.3); // 60-90% of max
      const bid = {
        taskId: task.id,
        agentId: bot.agentId,
        agentName: bot.name,
        price: parseFloat(baseBid.toFixed(4)),
        timeEstimate: '1h',
        message: `I can help with "${task.title}". ${bot.description || ''}`,
        wallet: bot.agentId
      };
      
      try {
        await marketplace.submitBid(bid);
        console.log('[AutoBid]', bot.name, 'bid', bid.price, 'SOL on', task.id);
      } catch (e) {
        console.error('[AutoBid] Error:', bot.name, e.message);
      }
    }
  }
}

module.exports = { autoBidFromBots };
