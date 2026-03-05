/**
 * BlissNexus Solana Integration - NON-CUSTODIAL
 * 
 * Users connect their own wallets. Funds go to on-chain escrow.
 * Currently configured for DEVNET testing.
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Use devnet for testing
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const connection = new Connection(RPC, 'confirmed');

// Anchor escrow program ID
const ESCROW_PROGRAM_ID = process.env.ESCROW_PROGRAM_ID || '64korfZTbv6sZQyuxa5FandZsLBkdKMPHR39bnaPeAxc';

async function getBalance(pubkey) {
  try {
    const balance = await connection.getBalance(new PublicKey(pubkey));
    return balance / LAMPORTS_PER_SOL;
  } catch (e) { 
    return 0; 
  }
}

async function getStatus() {
  try {
    const slot = await connection.getSlot();
    const cluster = RPC.includes('devnet') ? 'devnet' : 
                   RPC.includes('mainnet') ? 'mainnet-beta' : 'custom';
    return {
      connected: true,
      network: cluster,
      slot,
      rpc: RPC,
      custodial: false,
      escrowProgram: ESCROW_PROGRAM_ID,
      message: 'Non-custodial escrow on ' + cluster
    };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

/**
 * Verify a wallet signature
 */
function verifySignature(message, signature, publicKey) {
  try {
    const nacl = require('tweetnacl');
    const bs58 = require('bs58').default || require('bs58');
    
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(publicKey);
    
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (e) {
    console.error('[Solana] Signature verification error:', e.message);
    return false;
  }
}

/**
 * Get escrow PDA for a task
 */
function getEscrowPDA(taskId) {
  const taskBuffer = Buffer.alloc(32);
  Buffer.from(taskId).copy(taskBuffer);
  
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), taskBuffer],
    new PublicKey(ESCROW_PROGRAM_ID)
  );
  return pda.toBase58();
}

/**
 * Check escrow balance on-chain
 */
async function getEscrowBalance(taskId) {
  try {
    const pda = getEscrowPDA(taskId);
    const balance = await connection.getBalance(new PublicKey(pda));
    return {
      pda,
      balance: balance / LAMPORTS_PER_SOL,
      funded: balance > 0,
    };
  } catch (e) {
    return { pda: null, balance: 0, funded: false, error: e.message };
  }
}

/**
 * Verify a transaction on-chain
 */
async function verifyTransaction(signature) {
  try {
    const tx = await connection.getTransaction(signature, { 
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    return {
      confirmed: tx !== null,
      slot: tx?.slot,
      blockTime: tx?.blockTime,
    };
  } catch (e) {
    return { confirmed: false, error: e.message };
  }
}

module.exports = {
  getBalance,
  getStatus,
  verifySignature,
  getEscrowPDA,
  getEscrowBalance,
  verifyTransaction,
  connection,
  ESCROW_PROGRAM_ID,
};
