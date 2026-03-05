/**
 * BlissNexus Escrow Integration
 * Uses the deployed Anchor escrow program on Solana Devnet
 * Program ID: 64korfZTbv6sZQyuxa5FandZsLBkdKMPHR39bnaPeAxc
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Devnet RPCs with fallback
const DEVNET_RPCS = [
  'https://api.devnet.solana.com',
  'https://mango.devnet.rpcpool.com',
];

export const DEVNET_RPC = DEVNET_RPCS[0];
export const ESCROW_PROGRAM_ID = '64korfZTbv6sZQyuxa5FandZsLBkdKMPHR39bnaPeAxc';

// Get connection with fallback
export function getConnection() {
  return new Connection(DEVNET_RPCS[0], 'confirmed');
}

// Convert task ID to 32-byte array
export function taskIdToBytes(taskId) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(taskId);
  const buffer = new Uint8Array(32);
  buffer.set(bytes.slice(0, 32));
  return Array.from(buffer);
}

// Get escrow PDA for a task
export async function getEscrowPDA(taskId) {
  const taskBytes = new Uint8Array(taskIdToBytes(taskId));
  const [pda, bump] = PublicKey.findProgramAddressSync(
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
      return balance / LAMPORTS_PER_SOL;
    } catch (e) {
      console.warn(`[Escrow] RPC ${i} failed:`, e.message);
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
 * Build fund escrow transaction
 * Transfers SOL to the escrow PDA
 */
export async function buildFundEscrowTransaction(requesterWallet, taskId, solAmount) {
  const connection = getConnection();
  const { pda } = await getEscrowPDA(taskId);
  const requesterPubkey = new PublicKey(requesterWallet);
  
  const transaction = new Transaction();
  
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: requesterPubkey,
      toPubkey: pda,
      lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
    })
  );
  
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = requesterPubkey;
  
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
  taskIdToBytes,
};
