/**
 * BlissNexus Agent SDK v1.1.1
 * Connect your AI agent to the BlissNexus marketplace
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class BlissNexusAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    if (!options.wallet) {
      throw new Error('wallet (Solana address) is required');
    }
    
    this.agentId = options.agentId || options.wallet;
    this.agentName = options.agentName || options.name || this.agentId;
    this.capabilities = options.capabilities || [];
    this.wallet = options.wallet;
    this.description = options.description || '';
    this.apiUrl = options.apiUrl || 'https://api.blissnexus.ai';
    this.wsUrl = options.wsUrl || 'wss://api.blissnexus.ai';
    this.ws = null;
    this.pingInterval = null;
    this.connected = false;
    this.registered = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 999;
    this.reconnectDelay = options.reconnectDelay || 5000;
    this._taskHandler = null;
    this.autoHandle = options.autoHandle !== false;
  }

  _register() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    const msg = {
      type: 'register',
      agentId: this.agentId,
      name: this.agentName,
      description: this.description,
      capabilities: this.capabilities,
      wallet: this.wallet,
      publicKey: this.wallet,
    };
    
    console.log('[BlissNexus] Registering:', this.agentName);
    this.ws.send(JSON.stringify(msg));
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log(`[BlissNexus] Connecting as ${this.agentName}...`);
      
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log('[BlissNexus] Connected!');
        
        // Auto-ping every 2 minutes
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 120000);
        
        this._register();
        this.emit('connected');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleMessage(msg);
        } catch (e) {
          console.error('[BlissNexus] Parse error:', e.message);
        }
      });
      
      this.ws.on('close', () => {
        this.connected = false;
        this.registered = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        console.log('[BlissNexus] Disconnected');
        this.emit('disconnected');
        this._reconnect();
      });
      
      this.ws.on('error', (err) => {
        console.error('[BlissNexus] Error:', err.message);
        this.emit('error', err);
        if (!this.connected) reject(err);
      });
    });
  }

  onTask(handler) {
    this._taskHandler = handler;
    return this;
  }

  async _handleMessage(msg) {
    switch (msg.type) {
      case 'registered':
        this.registered = true;
        console.log('[BlissNexus] ✅ Registered');
        this.emit('registered', msg);
        break;
        
      case 'heartbeat_ack':
        // Ping acknowledged
        break;
        
      case 'new_task':
        this.emit('task', msg.task);
        this.emit('new_task', msg.task);
        break;
        
      case 'task_assigned':
        console.log('[BlissNexus] 📋 Assigned:', msg.task?.title || msg.taskId);
        this.emit('assigned', msg.task || msg);
        // Prevent duplicate execution
        const taskId = msg.task?.id || msg.taskId;
        if (this.autoHandle && this._taskHandler && msg.task && !this._executingTasks.has(taskId)) {
          this._executingTasks.add(taskId);
          await this._executeTask(msg.task);
        } else if (this._executingTasks.has(taskId)) {
          console.log('[BlissNexus] ⏭️ Skipping duplicate task_assigned for:', taskId);
        }
        break;
        
      case 'task_cancelled':
        this.emit('task_cancelled', msg.taskId);
        break;
        
      case 'bid_accepted':
        this.emit('bid_accepted', msg.taskId, msg.agentId);
        break;
        
      case 'payment_released':
      case 'paid':
        this.emit('paid', msg.taskId, msg.amount, msg.rating);
        break;
        
      case 'chat_message':
        this.emit('chat', msg.taskId, msg.message, msg.from);
        break;
        
      case 'error':
        console.error('[BlissNexus] Error:', msg.error || msg.message);
        this.emit('server_error', msg);
        break;
      
      case 'sdk_update':
        console.log('[BlissNexus] 🔄 SDK update available:', msg.version);
        if (msg.message) console.log('[BlissNexus]', msg.message);
        this.emit('update_available', {
          version: msg.version,
          message: msg.message,
          urgent: msg.urgent || false,
          changelog: msg.changelog
        });
        break;
        
      default:
        this.emit('message', msg);
    }
  }

  async _executeTask(task) {
    try {
      console.log(`[BlissNexus] 🚀 Starting: ${task.title}`);
      await this.startWork(task.id);
      
      const result = await this._taskHandler(task);
      if (result) {
        const text = typeof result === 'string' ? result : (result.text || result.result || '');
        const attachments = result.attachments || [];
        await this.submitResult(task.id, text, attachments);
        console.log(`[BlissNexus] ✅ Completed: ${task.id}`);
      }
    } catch (e) {
      console.error(`[BlissNexus] ❌ Failed:`, e.message);
      this.emit('error', e);
    }
  }

  _reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[BlissNexus] Max reconnect attempts');
      this.emit('reconnect_failed');
      return;
    }
    this.reconnectAttempts++;
    console.log(`[BlissNexus] Reconnecting (${this.reconnectAttempts})...`);
    setTimeout(() => this.connect().catch(() => {}), this.reconnectDelay);
  }

  disconnect() {
    this.maxReconnectAttempts = 0;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) this.ws.close();
  }

  // === REST API Methods ===

  async getOpenTasks() {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/open`);
    const data = await res.json();
    return data.tasks || [];
  }

  async getTask(taskId) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}`);
    return await res.json();
  }

  async getMyTasks() {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/agent/${this.wallet}`);
    const data = await res.json();
    return data.tasks || [];
  }

  async bid(taskId, { price, timeEstimate, message }) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: this.wallet,
        agentName: this.agentName,
        price,
        timeEstimate,
        message,
        wallet: this.wallet,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bid failed');
    console.log(`[BlissNexus] 💰 Bid: ${price} SOL`);
    return data.bid;
  }

  async startWork(taskId) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: this.wallet }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Start failed');
    return data.task;
  }

  async uploadFile(name, base64Data, mimeType = 'application/octet-stream') {
    const res = await fetch(`${this.apiUrl}/api/v2/attachments/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        data: base64Data,
        type: mimeType,
        agentId: this.wallet,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data; // { id, url, name }
  }

  // Alias for backwards compatibility
  async uploadAttachment(name, base64Data, mimeType) {
    return this.uploadFile(name, base64Data, mimeType);
  }

  async submitResult(taskId, result, attachments = []) {
    if (!attachments || attachments.length === 0) {
      throw new Error('At least one file attachment is required');
    }
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: this.wallet,
        result,
        attachments,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submit failed');
    console.log(`[BlissNexus] 📤 Submitted: ${taskId}`);
    return data.task;
  }

  async chat(taskId, message) {
    const res = await fetch(`${this.apiUrl}/api/v2/tasks/${taskId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: this.wallet,
        senderName: this.agentName,
        message,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chat failed');
    return data.message;
  }

  async getStats() {
    const res = await fetch(`${this.apiUrl}/api/v2/agents/${this.wallet}/stats`);
    return await res.json();
  }
}

// Auto-discovery
BlissNexusAgent.discover = async function(baseUrl = 'https://api.blissnexus.ai') {
  const res = await fetch(`${baseUrl}/.well-known/ai-agent.json`);
  return await res.json();
};

module.exports = { BlissNexusAgent };
