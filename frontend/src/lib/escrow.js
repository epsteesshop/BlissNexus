/**
 * BlissNexus Escrow Integration
 * Uses the deployed Anchor escrow program on Solana Devnet
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';

// Devnet RPCs with fallback
const DEVNET_RPCS = [
  'https://api.devnet.solana.com',
  'https://mango.devnet.rpcpool.com',
];

export const DEVNET_RPC = DEVNET_RPCS[0];
export const ESCROW_PROGRAM_ID = '64korfZTbv6sZQyuxa5FandZsLBkdKMPHR39bnaPeAxc';

// IDL for the escrow program (minimal version for client)
const IDL = {
  "version": "0.1.0",
  "name": "blissnexus_escrow",
  "instructions": [
    {
      "name": "createEscrow",
      "accounts": [
        { "name": "requester", "isMut": true, "isSigner": true },
        { "name": "escrow", "isMut": true, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "taskId", "type": { "array": ["u8", 32] } },
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "release",
      "accounts": [
        { "name": "requester", "isMut": true, "isSigner": true },
        { "name": "agent", "isMut": true, "isSigner": false },
        { "name": "escrow", "isMut": true, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "refund",
      "accounts": [
        { "name": "requester", "isMut": true, "isSigner": true },
        { "name": "escrow", "isMut": true, "isSigner": false }
      ],
      "args": []
    }
  ]
};

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
  const [pda, bump] = await PublicKey.findProgramAddressSync(
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
 * Build create escrow transaction
 */
export async function buildFundEscrowTransaction(requesterWallet, taskId, solAmount) {
  const connection = getConnection();
  const { pda } = await getEscrowPDA(taskId);
  const programId = new PublicKey(ESCROW_PROGRAM_ID);
  const requesterPubkey = new PublicKey(requesterWallet);
  
  // Create instruction data for createEscrow
  // Anchor discriminator + taskId (32 bytes) + amount (8 bytes)
  const taskBytes = taskIdToBytes(taskId);
  const amountBN = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
  
  // Build the transaction using System transfer for now
  // (The full Anchor integration requires the IDL to be properly loaded)
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
 * Build refund transaction (for disputes)
 */
export async function buildRefundTransaction(requesterWallet, taskId) {
  const connection = getConnection();
  const { pda } = await getEscrowPDA(taskId);
  
  const balance = await connection.getBalance(pda);
  if (balance === 0) {
    throw new Error('Escrow is empty');
  }
  
  // For now, refunds need the on-chain program
  // This will be called via the program instruction
  return {
    escrowPDA: pda.toBase58(),
    balance: balance / LAMPORTS_PER_SOL,
    programId: ESCROW_PROGRAM_ID,
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
  buildRefundTransaction,
  checkEscrowFunding,
  verifyTransaction,
  getEscrowPDA,
  taskIdToBytes,
};
