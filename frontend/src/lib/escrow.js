/**
 * BlissNexus Escrow Integration
 * Handles on-chain escrow for task payments on Solana Devnet
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Devnet RPCs with fallback
const DEVNET_RPCS = [
  'https://api.devnet.solana.com',
  'https://mango.devnet.rpcpool.com',
];

export const DEVNET_RPC = DEVNET_RPCS[0];
export const ESCROW_PROGRAM_ID = '7vNFHULaw8fmnCZPZ5GDFhWovUixe769qzupuqSA7kjw';

// Get connection with fallback
let connectionIndex = 0;
export function getConnection() {
  return new Connection(DEVNET_RPCS[connectionIndex], 'confirmed');
}

function rotateRpc() {
  connectionIndex = (connectionIndex + 1) % DEVNET_RPCS.length;
  console.log('[Escrow] Rotated to RPC:', DEVNET_RPCS[connectionIndex]);
}

// Convert task ID to bytes for PDA derivation
export function taskIdToBuffer(taskId) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(taskId);
  const buffer = new Uint8Array(32);
  buffer.set(bytes.slice(0, 32));
  return buffer;
}

// Get escrow PDA for a task
export async function getEscrowPDA(taskId) {
  const taskBytes = taskIdToBuffer(taskId);
  const [pda, bump] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode('escrow'), taskBytes],
    new PublicKey(ESCROW_PROGRAM_ID)
  );
  return { pda, bump };
}

// Get wallet balance with retry
export async function getBalance(walletAddress) {
  for (let i = 0; i < DEVNET_RPCS.length; i++) {
    try {
      const connection = new Connection(DEVNET_RPCS[i], 'confirmed');
      const pubkey = new PublicKey(walletAddress);
      const balance = await connection.getBalance(pubkey);
      console.log(`[Escrow] Balance from ${DEVNET_RPCS[i].split('//')[1].split('/')[0]}: ${balance / LAMPORTS_PER_SOL} SOL`);
      return balance / LAMPORTS_PER_SOL;
    } catch (e) {
      console.warn(`[Escrow] RPC ${i} failed:`, e.message);
      if (i === DEVNET_RPCS.length - 1) {
        console.error('[Escrow] All RPCs failed');
        return 0;
      }
    }
  }
  return 0;
}

// Request devnet airdrop
export async function requestAirdrop(walletAddress, solAmount = 1) {
  for (let i = 0; i < DEVNET_RPCS.length; i++) {
    try {
      const connection = new Connection(DEVNET_RPCS[i], 'confirmed');
      const pubkey = new PublicKey(walletAddress);
      const signature = await connection.requestAirdrop(pubkey, solAmount * LAMPORTS_PER_SOL);
      
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latestBlockhash });
      
      return { success: true, signature };
    } catch (e) {
      console.warn(`[Escrow] Airdrop via RPC ${i} failed:`, e.message);
    }
  }
  return { success: false, error: 'All faucets rate-limited. Try https://faucet.solana.com' };
}

/**
 * Build escrow funding transaction
 */
export async function buildFundEscrowTransaction(requesterWallet, taskId, solAmount) {
  const connection = getConnection();
  const { pda } = await getEscrowPDA(taskId);
  
  const transaction = new Transaction();
  
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey(requesterWallet),
      toPubkey: pda,
      lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
    })
  );
  
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = new PublicKey(requesterWallet);
  
  return {
    transaction,
    escrowPDA: pda.toBase58(),
    amount: solAmount,
  };
}

/**
 * Check escrow funding status
 */
export async function checkEscrowFunding(taskId) {
  for (let i = 0; i < DEVNET_RPCS.length; i++) {
    try {
      const connection = new Connection(DEVNET_RPCS[i], 'confirmed');
      const { pda } = await getEscrowPDA(taskId);
      const balance = await connection.getBalance(pda);
      return {
        funded: balance > 0,
        balance: balance / LAMPORTS_PER_SOL,
        escrowPDA: pda.toBase58(),
      };
    } catch (e) {
      console.warn(`[Escrow] Check funding via RPC ${i} failed`);
    }
  }
  return { funded: false, balance: 0, error: 'RPC unavailable' };
}

/**
 * Verify transaction confirmation
 */
export async function verifyTransaction(signature) {
  const connection = getConnection();
  try {
    const result = await connection.getSignatureStatus(signature);
    return {
      confirmed: result?.value?.confirmationStatus === 'confirmed' || 
                 result?.value?.confirmationStatus === 'finalized',
      status: result?.value?.confirmationStatus,
      error: result?.value?.err,
    };
  } catch (e) {
    return { confirmed: false, error: e.message };
  }
}

export default {
  DEVNET_RPC,
  ESCROW_PROGRAM_ID,
  getConnection,
  getBalance,
  requestAirdrop,
  buildFundEscrowTransaction,
  checkEscrowFunding,
  verifyTransaction,
  getEscrowPDA,
};
