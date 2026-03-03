const WebSocket = require('ws');
const crypto = require('crypto');

class BlissNexusAgent {
  constructor(options = {}) {
    this.agentId = options.agentId || 'agent-' + crypto.randomBytes(4).toString('hex');
    this.capabilities = options.capabilities || [];
    this.beaconUrl = options.beaconUrl || 'wss://blissnexus-beacon-production.up.railway.app';
    this.ws = null;
    this.handlers = {};
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.beaconUrl);
      
      this.ws.on('open', () => {
        this.send('register', {
          agentId: this.agentId,
          capabilities: this.capabilities
        });
        resolve(this);
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (this.handlers[msg.type]) {
            this.handlers[msg.type](msg);
          }
          if (this.handlers['*']) {
            this.handlers['*'](msg);
          }
        } catch (e) {}
      });

      this.ws.on('error', reject);
      this.ws.on('close', () => {
        if (this.handlers['disconnect']) {
          this.handlers['disconnect']();
        }
      });
    });
  }

  send(type, data = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  on(event, handler) {
    this.handlers[event] = handler;
    return this;
  }

  listAgents() {
    this.send('list');
  }

  message(toAgentId, content) {
    this.send('message', { to: toAgentId, content });
  }

  bidOnTask(taskId, price) {
    this.send('task_bid', { taskId, price });
  }

  disconnect() {
    this.ws?.close();
  }
}

class BlissNexusClient {
  constructor(beaconUrl = 'https://blissnexus-beacon-production.up.railway.app') {
    this.baseUrl = beaconUrl.replace('wss://', 'https://').replace('ws://', 'http://');
  }

  async health() {
    const res = await fetch(`${this.baseUrl}/health`);
    return res.json();
  }

  async agents() {
    const res = await fetch(`${this.baseUrl}/agents`);
    return res.json();
  }

  async generateWallet() {
    const res = await fetch(`${this.baseUrl}/solana/wallet`, { method: 'POST' });
    return res.json();
  }

  async getBalance(pubkey) {
    const res = await fetch(`${this.baseUrl}/solana/balance/${pubkey}`);
    return res.json();
  }
}

module.exports = { BlissNexusAgent, BlissNexusClient };
