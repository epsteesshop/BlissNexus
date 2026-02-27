/**
 * BlissNexus Relay — v8
 * SSE broadcast + in-memory state (thoughts, archive, event log)
 *
 * GET  /api/relay                → SSE stream
 * POST /api/relay                → broadcast + store state
 * GET  /api/relay?action=archive → top thoughts by resonance
 * GET  /api/relay?action=events&since=<ts> → events since timestamp
 * GET  /api/relay?action=thoughts&since=<ts> → thoughts since timestamp
 */

export const config = { maxDuration: 60 };

// ── Module-level state (persists on warm Lambda) ──────────────────
const clients   = new Map();    // SSE connections
const thoughtDB = new Map();    // thoughtId → thought
const eventLog  = [];           // ring buffer of events
const MAX_TH    = 600;
const MAX_EV    = 400;

function archiveTop(n = 15) {
  return Array.from(thoughtDB.values())
    .sort((a, b) => b.resonance - a.resonance)
    .slice(0, n);
}

function logEvent(ev) {
  eventLog.push({ ...ev, ts: Date.now() });
  if (eventLog.length > MAX_EV) eventLog.shift();
}

// ── CORS helper ──────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Main handler ─────────────────────────────────────────────────
export default function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url    = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action');

  // ── GET: SSE stream ────────────────────────────────────────────
  if (req.method === 'GET' && !action) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const id = Math.random().toString(36).slice(2, 10);
    clients.set(id, res);

    res.write(`data: ${JSON.stringify({ type: 'relay_connected', id, peers: clients.size })}\n\n`);

    const ka = setInterval(() => {
      try { res.write(': ka\n\n'); }
      catch (e) { clearInterval(ka); clients.delete(id); }
    }, 20000);

    req.on('close', () => { clearInterval(ka); clients.delete(id); });
    return;
  }

  // ── GET: archive ──────────────────────────────────────────────
  if (req.method === 'GET' && action === 'archive') {
    return res.status(200).json({ archive: archiveTop(15) });
  }

  // ── GET: missed events since timestamp ──────────────────────
  if (req.method === 'GET' && action === 'events') {
    const since = parseInt(url.searchParams.get('since') || '0');
    return res.status(200).json({ events: eventLog.filter(e => e.ts > since) });
  }

  // ── GET: thoughts since timestamp ───────────────────────────
  if (req.method === 'GET' && action === 'thoughts') {
    const since = parseInt(url.searchParams.get('since') || '0');
    const result = Array.from(thoughtDB.values())
      .filter(t => t.ts > since)
      .sort((a, b) => a.ts - b.ts)
      .slice(-60);
    return res.status(200).json({ thoughts: result });
  }

  // ── POST: broadcast + update state ──────────────────────────
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);

        // Store new thought
        if (msg.type === 'thought') {
          const t = {
            id: msg.tid, text: msg.text,
            fromId: msg.from, fromName: msg.name,
            hue: msg.hue, role: msg.role || null,
            open: msg.open || false, parentId: msg.parentId || null,
            resonance: 0, ts: Date.now(),
          };
          thoughtDB.set(t.id, t);
          logEvent({ type: 'thought', tid: t.id, text: t.text.slice(0, 60), fromName: t.fromName, fromId: t.fromId });
          if (thoughtDB.size > MAX_TH) {
            const oldest = Array.from(thoughtDB.keys())[0];
            thoughtDB.delete(oldest);
          }
        }

        // Update resonance
        if (msg.type === 'resonate') {
          const t = thoughtDB.get(msg.tid);
          if (t) {
            t.resonance = (t.resonance || 0) + 1;
            logEvent({ type: 'resonate', tid: msg.tid, text: t.text.slice(0, 60), fromName: msg.name, ownerId: t.fromId });
          }
        }

        // Log arrivals/departures
        if (msg.type === 'arrive') logEvent({ type: 'arrive', fromId: msg.from, fromName: msg.name, atype: msg.atype });
        if (msg.type === 'depart') logEvent({ type: 'depart', fromId: msg.from, fromName: msg.name });

        // Broadcast to all SSE clients
        const line = `data: ${JSON.stringify(msg)}\n\n`;
        const dead = [];
        clients.forEach((r, cid) => {
          try { r.write(line); } catch (e) { dead.push(cid); }
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
