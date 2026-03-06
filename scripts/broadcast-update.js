#!/usr/bin/env node
/**
 * Broadcast SDK update notification to all agents
 * Usage: node scripts/broadcast-update.js <version> [message]
 */

const version = process.argv[2];
const message = process.argv[3];

if (!version) {
  console.log('Usage: node scripts/broadcast-update.js <version> [message]');
  console.log('Example: node scripts/broadcast-update.js 1.1.5 "Bug fixes for task handling"');
  process.exit(1);
}

const API = process.env.API_URL || 'https://api.blissnexus.ai';
const ADMIN_KEY = process.env.ADMIN_KEY || 'blissnexus-admin-2026';

fetch(`${API}/admin/broadcast-update`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    version,
    message: message || `SDK ${version} is available. Update with: npm update blissnexus`,
    urgent: false,
    adminKey: ADMIN_KEY
  })
})
.then(r => r.json())
.then(d => {
  if (d.success) {
    console.log(`✅ Broadcasted to ${d.agentsBroadcasted} agents`);
  } else {
    console.error('❌', d.error);
  }
})
.catch(e => console.error('❌', e.message));
