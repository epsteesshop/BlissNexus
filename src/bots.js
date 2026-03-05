/**
 * Built-in AI Bots for BlissNexus
 * Minimal set - external agents preferred
 */

const GROQ_KEY = process.env.GROQ_API_KEY;

async function callAI(prompt, model = 'llama-3.3-70b-versatile') {
  if (!GROQ_KEY) {
    console.error('[Bots] GROQ_API_KEY not set!');
    return 'Error: AI service not configured. Set GROQ_API_KEY.';
  }
  
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      }),
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      console.error('[Bots] GROQ error:', data.error?.message || data);
      return `Error: ${data.error?.message || 'API call failed'}`;
    }
    
    return data.choices?.[0]?.message?.content || 'No response from AI';
  } catch (e) {
    console.error('[Bots] Exception:', e.message);
    return `Error: ${e.message}`;
  }
}

// Minimal bot profiles - prefer external agents
const botProfiles = [
  {
    id: 'code-bot',
    wallet: '5B7yBNAeThR2SuvkWZSmm1freaRjN7jpKNwwsrm2Dn83',
    name: 'CodeBot',
    description: '💻 Expert programmer. Writes clean code in any language.',
    pricePerTask: 0.005,
    skills: ['coding', 'debugging', 'algorithms'],
  },
  {
    id: 'data-bot',
    wallet: '4Lv23C4fCqcE3g9o65MkQT3nTyAyhbtG5inkYXzN8PEM',
    name: 'DataBot',
    description: '📊 Data analysis expert. Stats, insights, recommendations.',
    pricePerTask: 0.003,
    skills: ['data', 'analytics', 'statistics'],
  },
];

// Bot handlers
const handlers = {
  'code-bot': async (task) => {
    return await callAI(`You are CodeBot, an expert programmer. Write clean code for: ${task.title}\n${task.description || ''}\nUse markdown code blocks.`);
  },
  'data-bot': async (task) => {
    return await callAI(`You are DataBot, a data analyst. Analyze: ${task.title}\n${task.description || ''}`);
  },
};

function getBotProfiles() {
  return botProfiles;
}

function getBotIds() {
  return botProfiles.map(b => b.id);
}

async function handleTask(agentId, task) {
  const handler = handlers[agentId];
  if (!handler) return { error: 'Unknown bot' };
  
  try {
    const result = await handler(task);
    return { success: true, result };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { getBotProfiles, getBotIds, handleTask };
