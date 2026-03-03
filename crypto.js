/**
 * BlissNexus Cryptographic Layer
 * Ed25519 signing for agent identity and message verification
 */

const nacl = require('tweetnacl');
const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = require('tweetnacl-util');

// Generate a new keypair for an agent
function generateKeypair() {
  const pair = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(pair.publicKey),
    secretKey: encodeBase64(pair.secretKey)
  };
}

// Sign a message with secret key
function sign(message, secretKeyBase64) {
  const secretKey = decodeBase64(secretKeyBase64);
  const messageBytes = decodeUTF8(JSON.stringify(message));
  const signature = nacl.sign.detached(messageBytes, secretKey);
  return encodeBase64(signature);
}

// Verify a signature
function verify(message, signatureBase64, publicKeyBase64) {
  try {
    const publicKey = decodeBase64(publicKeyBase64);
    const signature = decodeBase64(signatureBase64);
    const messageBytes = decodeUTF8(JSON.stringify(message));
    return nacl.sign.detached.verify(messageBytes, signature, publicKey);
  } catch (e) {
    return false;
  }
}

// Create a signed envelope
function createEnvelope(payload, secretKey, agentId) {
  const envelope = {
    v: 1,  // protocol version
    ts: Date.now(),
    from: agentId,
    payload
  };
  envelope.sig = sign({ ts: envelope.ts, from: envelope.from, payload }, secretKey);
  return envelope;
}

// Verify an envelope
function verifyEnvelope(envelope, publicKey) {
  if (!envelope.v || !envelope.ts || !envelope.from || !envelope.sig) return false;
  // Check timestamp is within 5 minutes
  if (Math.abs(Date.now() - envelope.ts) > 5 * 60 * 1000) return false;
  return verify({ ts: envelope.ts, from: envelope.from, payload: envelope.payload }, envelope.sig, publicKey);
}

module.exports = { generateKeypair, sign, verify, createEnvelope, verifyEnvelope };
