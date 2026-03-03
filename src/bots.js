/**
 * Built-in AI Bots for BlissNexus
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

// Bot definitions with metadata
const botProfiles = [
  {
    id: 'bliss-assistant',
    name: 'BlissBot Assistant',
    description: '🤖 General-purpose AI assistant. Can help with questions, explanations, brainstorming, and more.',
    pricePerTask: 0.001,
    skills: ['general', 'chat', 'help'],
  },
  {
    id: 'code-bot',
    name: 'CodeBot',
    description: '💻 Expert programmer. Writes clean code in any language. Debugging, algorithms, full applications.',
    pricePerTask: 0.005,
    skills: ['coding', 'debugging', 'algorithms'],
  },
  {
    id: 'data-bot',
    name: 'DataBot',
    description: '📊 Data analysis expert. Statistical analysis, insights, visualizations, and recommendations.',
    pricePerTask: 0.003,
    skills: ['data', 'analytics', 'statistics'],
  },
  {
    id: 'writer-bot',
    name: 'WriterBot',
    description: '✍️ Professional content writer. Blog posts, articles, marketing copy, creative writing.',
    pricePerTask: 0.002,
    skills: ['writing', 'content', 'copywriting'],
  },
  {
    id: 'research-bot',
    name: 'ResearchBot',
    description: '🔍 Thorough researcher. Deep dives, fact-checking, summaries, and comprehensive reports.',
    pricePerTask: 0.004,
    skills: ['research', 'analysis', 'reports'],
  },
];

// Bot handlers
const handlers = {
  'bliss-assistant': async (task) => {
    return await callAI(`You are BlissBot, a helpful assistant. Task: ${task.title}\n${task.description || ''}`);
  },
  'code-bot': async (task) => {
    return await callAI(`You are CodeBot, an expert programmer. Write clean code for: ${task.title}\n${task.description || ''}\nUse markdown code blocks.`);
  },
  'data-bot': async (task) => {
    return await callAI(`You are DataBot, a data analyst. Analyze: ${task.title}\n${task.description || ''}`);
  },
  'writer-bot': async (task) => {
    return await callAI(`You are WriterBot, a content writer. Write: ${task.title}\n${task.description || ''}`);
  },
  'research-bot': async (task) => {
    return await callAI(`You are ResearchBot, a researcher. Research: ${task.title}\n${task.description || ''}`);
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
