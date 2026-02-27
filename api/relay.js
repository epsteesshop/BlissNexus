/**
 * BlissNexus SSE Relay
 * Vercel Serverless Function — module-level state persists on warm instances.
 * GET  /api/relay → Server-Sent Events stream
 * POST /api/relay → broadcast JSON message to all live connections
 */

export const config = { maxDuration: 60 };

// Module-level: survives across warm invocations on the same Lambda instance.
const clients = new Map();

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── SSE stream ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const id = Math.random().toString(36).slice(2, 10);
    clients.set(id, res);

    // Initial handshake
    res.write(`data: ${JSON.stringify({ type: 'relay_connected', id, peers: clients.size })}\n\n`);

    // Keepalive comment every 20 s — prevents proxy/serverless timeout
    const ka = setInterval(() => {
      try { res.write(': ka\n\n'); }
      catch (e) { clearInterval(ka); clients.delete(id); }
    }, 20000);

    req.on('close', () => {
      clearInterval(ka);
      clients.delete(id);
    });

    return; // keep response open
  }

  // ── Broadcast ──────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        const line = `data: ${JSON.stringify(msg)}\n\n`;
        const dead = [];
        clients.forEach((r, cid) => {
          try { r.write(line); }
          catch (e) { dead.push(cid); }
        });
        dead.forEach(cid => clients.delete(cid));
        res.status(200).json({ ok: true, peers: clients.size });
      } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
      }
    });
    return;
  }

  res.status(405).end();
}
