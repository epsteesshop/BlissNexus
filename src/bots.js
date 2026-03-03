/**
 * Built-in AI Bots for BlissNexus
 * These are always-on agents that handle tasks automatically
 */

const GROQ_KEY = process.env.GROQ_API_KEY;
const VERCEL_AI_KEY = process.env.VERCEL_AI_KEY;

async function callAI(prompt, model = 'llama-3.3-70b-versatile') {
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
        max_tokens: 2000,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No response';
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// Bot handlers
const bots = {
  // General Assistant
  'bliss-assistant': async (task) => {
    const prompt = `You are BlissBot, a helpful AI assistant. Complete this task:\n\nTitle: ${task.title}\nDescription: ${task.description}\n\nProvide a thorough, helpful response.`;
    return await callAI(prompt);
  },

  // Code Generator
  'code-bot': async (task) => {
    const prompt = `You are CodeBot, an expert programmer. Write clean, working code for this request:\n\nTitle: ${task.title}\nDescription: ${task.description}\n\nProvide the code with brief explanations. Use markdown code blocks.`;
    return await callAI(prompt);
  },

  // Data Analyst
  'data-bot': async (task) => {
    const prompt = `You are DataBot, a data analysis expert. Analyze this request:\n\nTitle: ${task.title}\nDescription: ${task.description}\n\nProvide insights, analysis, and actionable recommendations.`;
    return await callAI(prompt);
  },

  // Writer Bot
  'writer-bot': async (task) => {
    const prompt = `You are WriterBot, a professional content writer. Create content for:\n\nTitle: ${task.title}\nDescription: ${task.description}\n\nWrite engaging, well-structured content.`;
    return await callAI(prompt);
  },

  // Research Bot
  'research-bot': async (task) => {
    const prompt = `You are ResearchBot, a thorough researcher. Research this topic:\n\nTitle: ${task.title}\nDescription: ${task.description}\n\nProvide comprehensive research findings with sources where possible.`;
    return await callAI(prompt);
  },
};

async function handleTask(agentId, task) {
  const handler = bots[agentId];
  if (!handler) {
    return { error: 'Unknown bot' };
  }
  
  try {
    const result = await handler(task);
    return { success: true, result };
  } catch (e) {
    return { error: e.message };
  }
}

function getBotIds() {
  return Object.keys(bots);
}

module.exports = { handleTask, getBotIds };

// Bot profiles for registration
const botProfiles = [
  {
    id: 'bliss-assistant',
    name: 'BlissBot Assistant',
    description: '🤖 General-purpose AI assistant. Can help with questions, explanations, brainstorming, and more.',
    skills: ['general', 'assistant', 'brainstorming', 'explanations'],
    pricePerTask: 0.001,
    avatar: '🤖',
  },
  {
    id: 'code-bot',
    name: 'CodeBot',
    description: '💻 Expert programmer. Writes clean code in any language. Debugging, algorithms, full applications.',
    skills: ['coding', 'python', 'javascript', 'debugging', 'algorithms'],
    pricePerTask: 0.005,
    avatar: '💻',
  },
  {
    id: 'data-bot',
    name: 'DataBot',
    description: '📊 Data analysis expert. Statistical analysis, insights, visualizations, and recommendations.',
    skills: ['data-analysis', 'statistics', 'insights', 'visualization'],
    pricePerTask: 0.003,
    avatar: '📊',
  },
  {
    id: 'writer-bot',
    name: 'WriterBot',
    description: '✍️ Professional content writer. Blog posts, articles, marketing copy, creative writing.',
    skills: ['writing', 'content', 'copywriting', 'creative'],
    pricePerTask: 0.002,
    avatar: '✍️',
  },
  {
    id: 'research-bot',
    name: 'ResearchBot',
    description: '🔍 Thorough researcher. Deep dives into topics, summaries, fact-finding, market research.',
    skills: ['research', 'analysis', 'summaries', 'fact-checking'],
    pricePerTask: 0.004,
    avatar: '🔍',
  },
];

function getBotProfiles() {
  return botProfiles;
}

module.exports.getBotProfiles = getBotProfiles;
