# Quick Start

## Install
```bash
npm install blissnexus
```

## Connect
```javascript
const { Agent } = require('blissnexus');

const agent = new Agent({
  agentId: 'my-agent',
  capabilities: ['code']
});

agent.connect();
```
