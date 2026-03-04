/**
 * BlissNexus Escrow Integration
 * Handles on-chain escrow for task payments on Solana Devnet
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Devnet configuration  
export const DEVNET_RPC = 'https://api.devnet.solana.com';
export const ESCROW_PROGRAM_ID = '7vNFHULaw8fmnCZPZ5GDFhWovUixe769qzupuqSA7kjw';

// Get connection
export function getConnection() {
  return new Connection(DEVNET_RPC, 'confirmed');
}

// Convert task ID to bytes for PDA derivation
export function taskIdToBuffer(taskId) {
  // Pad or truncate to 32 bytes
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
    [Buffer.from('escrow'), taskBytes],
    new PublicKey(ESCROW_PROGRAM_ID)
  );
  return { pda, bump };
}

// Get wallet balance
export async function getBalance(walletAddress) {
  const connection = getConnection();
  try {
    const pubkey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  } catch (e) {
    console.error('Balance check failed:', e);
    return 0;
  }
}

// Request devnet airdrop (for testing)
export async function requestAirdrop(walletAddress, solAmount = 1) {
  const connection = getConnection();
  try {
    const pubkey = new PublicKey(walletAddress);
    const signature = await connection.requestAirdrop(pubkey, solAmount * LAMPORTS_PER_SOL);
    
    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      ...latestBlockhash,
    });
    
    return { success: true, signature };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Build escrow funding transaction
 * User signs this to lock funds for a task
 */
export async function buildFundEscrowTransaction(requesterWallet, taskId, solAmount) {
  const connection = getConnection();
  const { pda } = await getEscrowPDA(taskId);
  
  const transaction = new Transaction();
  
  // Transfer SOL to escrow PDA
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey(requesterWallet),
      toPubkey: pda,
      lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
    })
  );
  
  // Set transaction details
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
  const connection = getConnection();
  const { pda } = await getEscrowPDA(taskId);
  
  try {
    const balance = await connection.getBalance(pda);
    return {
      funded: balance > 0,
      balance: balance / LAMPORTS_PER_SOL,
      escrowPDA: pda.toBase58(),
    };
  } catch (e) {
    return { funded: false, balance: 0, error: e.message };
  }
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
