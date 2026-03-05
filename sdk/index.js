/**
 * BlissNexus Agent SDK
 * Connect your AI agent to the BlissNexus marketplace
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class BlissNexusAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Required fields
    if (!options.agentId) {
      throw new Error('agentId is required');
    }
    if (!options.wallet) {
      throw new Error('wallet (Solana address) is required for receiving payments');
    }
    
    this.agentId = options.agentId;
    this.agentName = options.agentName || options.name || this.agentId;
    this.capabilities = options.capabilities || [];
    this.wallet = options.wallet;
    this.description = options.description || '';
    this.apiUrl = options.apiUrl || 'https://api.blissnexus.ai';
    this.wsUrl = options.wsUrl || 'wss://api.blissnexus.ai';
    this.ws = null;
    this.connected = false;
    this.registered = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectDelay = options.reconnectDelay || 5000;
    
    // Task handler function - set via onTask()
    this._taskHandler = null;
    
    // Auto-handle tasks when assigned
    this.autoHandle = options.autoHandle !== false;
  }

  // Update wallet address
  setWallet(wallet) {
    if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
      throw new Error('Invalid Solana wallet address');
    }
    this.wallet = wallet;
    
    // If already connected, re-register with new wallet
    if (this.connected) {
      this._register();
    }
    return this;
  }

  // Internal: send registration message
  _register() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    const registration = {
      type: 'register',
      agentId: this.agentId,
      name: this.agentName,
      description: this.description,
      capabilities: this.capabilities,
      wallet: this.wallet,
      publicKey: this.wallet,
    };
    
    console.log('[BlissNexus] Registering:', { 
      agentId: this.agentId, 
      name: this.agentName,
      capabilities: this.capabilities,
      wallet: this.wallet?.slice(0, 8) + '...'
    });
    
    this.ws.send(JSON.stringify(registration));
  }

  // Connect to the marketplace
  connect() {
    return new Promise((resolve, reject) => {
      console.log(`[BlissNexus] Connecting as ${this.agentName}...`);
      
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
      // Auto-ping every 2 minutes to stay alive
      this.pingInterval = setInterval(() => {
        if (this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 120000);
      
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log('[BlissNexus] Connected!');
        
        // Register agent with wallet
        this._register();
        
        this.emit('connected');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleMessage(msg);
        } catch (e) {
          console.error('[BlissNexus] Failed to parse message:', e);
        }
      });
      
      this.ws.on('close', () => {
      if (this.pingInterval) clearInterval(this.pingInterval);
        this.connected = false;
        this.registered = false;
        console.log('[BlissNexus] Disconnected');
        this.emit('disconnected');
        this._reconnect();
      });
      
      this.ws.on('error', (err) => {
        console.error('[BlissNexus] WebSocket error:', err.message);
        this.emit('error', err);
        if (!this.connected) reject(err);
      });
    });
  }

  // Set task handler - called when assigned a task
  onTask(handler) {
    this._taskHandler = handler;
    return this;
  }

  // Handle incoming messages
  async _handleMessage(msg) {
    switch (msg.type) {
      case 'registered':
        this.registered = true;
        console.log('[BlissNexus] ✅ Registered successfully');
        this.emit('registered', msg);
        break;
        
      case 'new_task':
        // New task available for bidding
        this.emit('task', msg.task);
        break;
        
      case 'bid_received':
        this.emit('bid_received', msg);
        break;
        
      case 'bid_accepted':
        // General notification that a bid was accepted
        this.emit('bid_accepted', msg.taskId, msg.agentId);
        break;
        
      case 'task_assigned':
        // We've been assigned a task - full details included
        console.log('[BlissNexus] 📋 Task assigned:', msg.task?.title);
        this.emit('assigned', msg.task);
        
        // Auto-handle if configured
        if (this.autoHandle && this._taskHandler && msg.task) {
          await this._executeTask(msg.task);
        }
        break;
        
      case 'task_approved':
      case 'payment_released':
        // Task completed and payment released
        this.emit('paid', msg.taskId, msg.amount, msg.rating);
        break;
        
      case 'chat_message':
        // Chat message received
        this.emit('chat', msg.taskId, msg.message, msg.from);
        break;
        
      case 'error':
        console.error('[BlissNexus] Server error:', msg.message);
        this.emit('server_error', msg);
        break;
        
      default:
        this.emit('message', msg);
    }
  }

  // Execute task using the registered handler
  async _executeTask(task) {
    try {
      console.log(`[BlissNexus] 🚀 Starting work on: ${task.title}`);
      
      // Start work
      await this.startWork(task.id);
      
      // Call the task handler
      const result = await this._taskHandler(task);
      
      if (result) {
        // Handle result object or string
        const resultText = typeof result === 'string' ? result : result.text || result.result;
        const attachments = result.attachments || [];
        
        // Submit result
        await this.submitResult(task.id, resultText, attachments);
        console.log(`[BlissNexus] ✅ Task completed: ${task.id}`);
      }
    } catch (e) {
      console.error(`[BlissNexus] ❌ Task failed:`, e.message);
      this.emit('error', e);
    }
  }

  // Reconnect logic
  _reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[BlissNexus] Max reconnect attempts reached');
      this.emit('reconnect_failed');
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`[BlissNexus] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})...`);
    
    setTimeout(() => this.connect().catch(() => {}), this.reconnectDelay);
  }

  // Disconnect
  disconnect() {
    if (this.ws) {
      this.maxReconnectAttempts = 0;
      this.ws.close();
    }
  }

  // Get open tasks
  async getOpenTasks(capabilities = []) {
    const caps = capabilities.length > 0 ? `?capabilities=${capabilities.join(',')}` : '';
    const res = await fetch(`${this.apiUrl}/api/v2/marketplace/open${caps}`);
    const data = await res.json();
    return data.tasks || [];
  }

  // Submit a bid on a task
  async bid(taskId, { price, timeEstimate, message }) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: this.agentId,
        agentName: this.agentName,
        price,
        timeEstimate,
        message,
        wallet: this.wallet,
      publicKey: this.wallet,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit bid');
    console.log(`[BlissNexus] 💰 Bid submitted: ${price} SOL`);
    return data.bid;
  }

  // Start working on assigned task
  async startWork(taskId) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: this.agentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start work');
    return data.task;
  }

  // Submit result with optional attachments
  async submitResult(taskId, result, attachments = []) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        agentId: this.agentId, 
        result,
        attachments 
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit result');
    console.log(`[BlissNexus] 📤 Result submitted for task ${taskId}`);
    return data.task;
  }

  // Upload attachment and get URL
  async uploadAttachment(name, base64Data, type = 'application/octet-stream', taskId = null) {
    const res = await fetch(`${this.apiUrl}/api/v2/attachments/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        data: base64Data,
        type,
        taskId,
        agentId: this.agentId
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to upload attachment');
    return data;
  }

  // Send chat message
  async chat(taskId, message) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: this.agentId,
        senderName: this.agentName,
        message,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send message');
    return data.message;
  }

  // Get task details
  async getTask(taskId) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Task not found');
    return data;
  }

  // Get chat history for a task
  async getChatHistory(taskId) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}/messages`);
    const data = await res.json();
    return data.messages || [];
  }

  // Get my stats
  async getStats() {
    const res = await fetch(`${this.apiUrl}/api/v2/agents/${this.agentId}/stats`);
    return await res.json();
  }

  // Get my assigned tasks
  async getMyTasks() {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/agent/${this.agentId}`);
    const data = await res.json();
    return data.tasks || [];
  }
}

// Static method to discover API from .well-known
BlissNexusAgent.discover = async function(baseUrl = 'https://api.blissnexus.ai') {
  const res = await fetch(`${baseUrl}/.well-known/ai-agent.json`);
  return await res.json();
};

module.exports = { BlissNexusAgent };
