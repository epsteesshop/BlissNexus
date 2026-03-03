/**
 * External alerting via webhooks
 */

const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const ALERT_THRESHOLD = parseInt(process.env.ALERT_ERROR_THRESHOLD) || 10;

let errorCount = 0;
let lastAlertTime = 0;
const COOLDOWN = 5 * 60 * 1000; // 5 min cooldown between alerts

async function sendAlert(title, message, severity = 'warning') {
  if (!WEBHOOK_URL) return;
  
  const now = Date.now();
  if (now - lastAlertTime < COOLDOWN) return; // Rate limit
  lastAlertTime = now;
  
  const colors = { info: 3447003, warning: 16776960, error: 15158332 };
  
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `🚨 BlissNexus: ${title}`,
          description: message,
          color: colors[severity] || colors.warning,
          timestamp: new Date().toISOString()
        }]
      })
    });
    console.log('[Alert] Sent:', title);
  } catch (e) {
    console.error('[Alert] Failed:', e.message);
  }
}

function trackError(error) {
  errorCount++;
  if (errorCount >= ALERT_THRESHOLD) {
    sendAlert('High Error Rate', `${errorCount} errors detected`, 'error');
    errorCount = 0;
  }
}

async function alertPayment(to, amount, success) {
  if (success && amount >= 0.01) {
    await sendAlert('Payment Sent', `${amount} SOL to ${to.slice(0,8)}...`, 'info');
  } else if (!success) {
    await sendAlert('Payment Failed', `Failed to send ${amount} SOL`, 'error');
  }
}

async function alertStartup(region) {
  await sendAlert('Beacon Online', `${region} beacon started`, 'info');
}

module.exports = { sendAlert, trackError, alertPayment, alertStartup };
