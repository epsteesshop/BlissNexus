/**
 * BlissNexus Solana Integration - NON-CUSTODIAL
 * 
 * We NEVER touch private keys. Users connect their own wallets.
 * Funds go to on-chain escrow (Anchor program), not our wallet.
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC, 'confirmed');

// Anchor escrow program ID (deployed on mainnet)
const ESCROW_PROGRAM_ID = process.env.ESCROW_PROGRAM_ID || null;

async function getBalance(pubkey) {
  try {
    return (await connection.getBalance(new PublicKey(pubkey))) / LAMPORTS_PER_SOL;
  } catch (e) { return 0; }
}

async function getStatus() {
  try {
    const slot = await connection.getSlot();
    return {
      connected: true,
      network: 'mainnet-beta',
      slot,
      custodial: false,
      escrowProgram: ESCROW_PROGRAM_ID || 'NOT_DEPLOYED',
      message: 'Non-custodial: Users connect their own wallets'
    };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

/**
 * Verify a wallet signature to prove ownership
 * User signs a message client-side, we verify server-side
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
    return false;
  }
}

/**
 * Generate the escrow PDA (Program Derived Address) for a task
 * This is where funds are locked on-chain
 */
function getEscrowPDA(taskId) {
  if (!ESCROW_PROGRAM_ID) return null;
  
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), Buffer.from(taskId)],
    new PublicKey(ESCROW_PROGRAM_ID)
  );
  return pda.toBase58();
}

/**
 * Build unsigned transaction for creating escrow
 * Client will sign this with their wallet
 */
async function buildCreateEscrowTx(taskId, requesterPubkey, workerPubkey, amountSol) {
  if (!ESCROW_PROGRAM_ID) {
    return { error: 'Escrow program not deployed yet' };
  }
  
  // Return instruction data for client to build + sign transaction
  return {
    program: ESCROW_PROGRAM_ID,
    instruction: 'createEscrow',
    accounts: {
      requester: requesterPubkey,
      worker: workerPubkey,
      escrowPDA: getEscrowPDA(taskId),
      systemProgram: '11111111111111111111111111111111'
    },
    args: {
      taskId: taskId,
      amount: Math.floor(amountSol * LAMPORTS_PER_SOL)
    },
    message: 'Client must build and sign this transaction using @coral-xyz/anchor'
  };
}

/**
 * Build unsigned transaction for releasing escrow
 * Requester signs to release funds to worker
 */
async function buildReleaseTx(taskId, requesterPubkey, workerPubkey) {
  if (!ESCROW_PROGRAM_ID) {
    return { error: 'Escrow program not deployed yet' };
  }
  
  return {
    program: ESCROW_PROGRAM_ID,
    instruction: 'release',
    accounts: {
      requester: requesterPubkey,
      worker: workerPubkey,
      escrowPDA: getEscrowPDA(taskId)
    },
    args: { taskId },
    message: 'Requester must sign to release funds to worker'
  };
}

/**
 * Build unsigned transaction for refund
 * Worker signs to allow refund to requester
 */
async function buildRefundTx(taskId, requesterPubkey, workerPubkey) {
  if (!ESCROW_PROGRAM_ID) {
    return { error: 'Escrow program not deployed yet' };
  }
  
  return {
    program: ESCROW_PROGRAM_ID,
    instruction: 'refund',
    accounts: {
      requester: requesterPubkey,
      worker: workerPubkey,
      escrowPDA: getEscrowPDA(taskId)
    },
    args: { taskId },
    message: 'Worker must sign to refund to requester'
  };
}

module.exports = { 
  getBalance, 
  getStatus,
  verifySignature,
  getEscrowPDA,
  buildCreateEscrowTx,
  buildReleaseTx,
  buildRefundTx
};
