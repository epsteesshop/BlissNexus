/**
 * BlissNexus Escrow - Anchor Program Integration
 * Program ID: 7vNFHULaw8fmnCZPZ5GDFhWovUixe769qzupuqSA7kjw
 */

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram, 
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import { sha256 } from 'js-sha256';

// Config
const MAINNET_RPCS = [
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
];
export const MAINNET_RPC = MAINNET_RPCS[0];
export const ESCROW_PROGRAM_ID = '7vNFHULaw8fmnCZPZ5GDFhWovUixe769qzupuqSA7kjw';
export const ARBITRATOR = '14jEkruEqbG1pS8YaKhXeS5xBQFzgfXqy2GinLwcwz8q';

// Get connection — tries RPCs in order, returns first working one
export function getConnection() {
  return new Connection(MAINNET_RPCS[0], 'confirmed');
}

// Get connection with fallback (async)
async function getWorkingConnection() {
  for (const rpc of MAINNET_RPCS) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      await conn.getLatestBlockhash();
      return conn;
    } catch (e) {
      console.warn('[escrow] RPC unavailable:', rpc);
    }
  }
  throw new Error('All RPC endpoints failed');
}

// Convert task ID to 32-byte array
export function taskIdToBytes(taskId) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(taskId);
  const buffer = new Uint8Array(32);
  buffer.set(bytes.slice(0, 32));
  return buffer;
}

// Get Anchor instruction discriminator
function getDiscriminator(name) {
  const preimage = `global:${name}`;
  const hashHex = sha256(preimage);
  // Convert hex to bytes
  const bytes = new Uint8Array(hashHex.match(/.{2}/g).map(byte => parseInt(byte, 16)));
  return bytes.slice(0, 8);
}

// Concatenate Uint8Arrays (browser-compatible Buffer.concat replacement)
function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Get escrow PDA
export function getEscrowPDA(taskId) {
  const taskBytes = taskIdToBytes(taskId);
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('escrow'), taskBytes],
    new PublicKey(ESCROW_PROGRAM_ID)
  );
  return { pda, bump };
}

// Get wallet balance
export async function getBalance(walletAddress) {
  for (const rpc of MAINNET_RPCS) {
    try {
      const connection = new Connection(rpc, 'confirmed');
      const balance = await connection.getBalance(new PublicKey(walletAddress));
      return balance / LAMPORTS_PER_SOL;
    } catch (e) {
      console.warn('[Escrow] RPC failed:', e.message);
    }
  }
  return 0;
}

// Request airdrop
export async function requestAirdrop(walletAddress, solAmount = 1) {
  try {
    const connection = new Connection('https://mango.mainnet-beta.rpcpool.com', 'confirmed');
    const signature = await connection.requestAirdrop(
      new PublicKey(walletAddress), 
      solAmount * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature);
    return { success: true, signature };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Build createEscrow transaction
 * Locks funds in program-owned PDA
 */
export async function buildCreateEscrowTransaction(requesterWallet, taskId, solAmount, workerWallet, connection) {
  // Validate worker wallet
  if (!workerWallet) {
    throw new Error('Worker wallet is required for escrow creation');
  }
  // Use provided connection or fall back to working RPC
  if (!connection) connection = await getWorkingConnection();
  const programId = new PublicKey(ESCROW_PROGRAM_ID);
  const requesterPubkey = new PublicKey(requesterWallet);
  const workerPubkey = new PublicKey(workerWallet);
  const { pda: escrowPDA } = getEscrowPDA(taskId);
  
  // Build instruction data: discriminator + task_id (32) + amount (8) + worker (32)
  const discriminator = getDiscriminator('create_escrow');
  const taskBytes = taskIdToBytes(taskId);
  const amountBytes = new Uint8Array(8);
  const view = new DataView(amountBytes.buffer);
  view.setBigUint64(0, BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL)), true);
  const workerBytes = workerPubkey.toBytes();
  
  const data = concatBytes(discriminator, taskBytes, amountBytes, workerBytes);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: requesterPubkey, isSigner: true, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
  
  const transaction = new Transaction().add(instruction);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = requesterPubkey;
  
  return {
    transaction,
    escrowPDA: escrowPDA.toBase58(),
    amount: solAmount,
  };
}

/**
 * Build release transaction (approve and pay agent)
 */
export async function buildReleaseTransaction(requesterWallet, taskId, agentWallet, connection) {
  if (!connection) connection = await getWorkingConnection();
  const programId = new PublicKey(ESCROW_PROGRAM_ID);
  const requesterPubkey = new PublicKey(requesterWallet);
  const agentPubkey = new PublicKey(agentWallet);
  const { pda: escrowPDA } = getEscrowPDA(taskId);
  
  const discriminator = getDiscriminator('release');
  const taskBytes = taskIdToBytes(taskId);
  
  // Instruction data: [8-byte discriminator][32-byte task_id]
  const data = concatBytes(discriminator, taskBytes);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: requesterPubkey, isSigner: true, isWritable: true },
      { pubkey: agentPubkey, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
    ],
    programId,
    data,
  });
  
  const transaction = new Transaction().add(instruction);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = requesterPubkey;
  
  return { transaction, escrowPDA: escrowPDA.toBase58() };
}

/**
 * Build dispute transaction
 */
export async function buildDisputeTransaction(requesterWallet, taskId, reason = '') {
  const connection = await getWorkingConnection();
  const programId = new PublicKey(ESCROW_PROGRAM_ID);
  const requesterPubkey = new PublicKey(requesterWallet);
  const { pda: escrowPDA } = getEscrowPDA(taskId);
  
  // Reason is 64 bytes
  const reasonBytes = new Uint8Array(64);
  const encoded = new TextEncoder().encode(reason);
  reasonBytes.set(encoded.slice(0, 64));
  
  const discriminator = getDiscriminator('dispute');
  const data = concatBytes(discriminator, reasonBytes);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: requesterPubkey, isSigner: true, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
    ],
    programId,
    data,
  });
  
  const transaction = new Transaction().add(instruction);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = requesterPubkey;
  
  return { transaction, escrowPDA: escrowPDA.toBase58() };
}

/**
 * Build cancel transaction (refund before agent assigned)
 */
export async function buildCancelTransaction(requesterWallet, taskId) {
  const connection = await getWorkingConnection();
  const programId = new PublicKey(ESCROW_PROGRAM_ID);
  const requesterPubkey = new PublicKey(requesterWallet);
  const { pda: escrowPDA } = getEscrowPDA(taskId);
  
  const discriminator = getDiscriminator('refund');  // Anchor instruction is 'refund'
  const taskBytes = taskIdToBytes(taskId);
  
  // Instruction data: [8-byte discriminator][32-byte task_id]
  const data = concatBytes(discriminator, taskBytes);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: requesterPubkey, isSigner: true, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
    ],
    programId,
    data,
  });
  
  const transaction = new Transaction().add(instruction);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = requesterPubkey;
  
  return { transaction, escrowPDA: escrowPDA.toBase58() };
}

/**
 * Check escrow status
 */
export async function checkEscrowFunding(taskId) {
  const connection = await getWorkingConnection();
  const { pda } = getEscrowPDA(taskId);
  
  try {
    const accountInfo = await connection.getAccountInfo(pda);
    
    if (!accountInfo) {
      return { funded: false, balance: 0, exists: false };
    }
    
    const balance = accountInfo.lamports / LAMPORTS_PER_SOL;
    const isProgramOwned = accountInfo.owner.toBase58() === ESCROW_PROGRAM_ID;
    
    return {
      funded: balance > 0,
      balance,
      exists: true,
      escrowPDA: pda.toBase58(),
      isProgramOwned,
      owner: accountInfo.owner.toBase58(),
    };
  } catch (e) {
    return { funded: false, balance: 0, error: e.message };
  }
}

/**
 * Get escrow account data (parsed)
 */
export async function getEscrowData(taskId) {
  const connection = await getWorkingConnection();
  const { pda } = getEscrowPDA(taskId);
  
  try {
    const accountInfo = await connection.getAccountInfo(pda);
    if (!accountInfo || accountInfo.data.length < 8) {
      return null;
    }
    
    // Parse escrow account data
    // Skip 8-byte discriminator
    const data = accountInfo.data.slice(8);
    
    // requester: Pubkey (32), agent: Pubkey (32), task_id: [u8;32], amount: u64, state: u8, bump: u8, dispute_reason: [u8;64]
    const requester = new PublicKey(data.slice(0, 32)).toBase58();
    const agent = new PublicKey(data.slice(32, 64)).toBase58();
    const view = new DataView(data.buffer, data.byteOffset + 96, 8);
    const amount = Number(view.getBigUint64(0, true)) / LAMPORTS_PER_SOL;
    const state = data[104];
    
    const stateNames = ['Funded', 'Assigned', 'Released', 'Refunded', 'Disputed', 'Cancelled'];
    
    return {
      requester,
      agent,
      amount,
      state: stateNames[state] || 'Unknown',
      stateCode: state,
      escrowPDA: pda.toBase58(),
    };
  } catch (e) {
    console.error('[Escrow] Failed to parse:', e);
    return null;
  }
}


/**
 * Verify escrow was created correctly
 */
export async function verifyEscrow(taskId, expectedWorker) {
  const connection = await getWorkingConnection();
  const { pda } = getEscrowPDA(taskId);
  
  try {
    const info = await connection.getAccountInfo(pda);
    if (!info) {
      return { valid: false, error: 'Escrow account not found' };
    }
    
    const buffer = info.data;
    // Skip 8-byte discriminator, 32-byte requester
    const workerBytes = buffer.slice(40, 72);
    const worker = new PublicKey(workerBytes);
    
    if (worker.toBase58() === '11111111111111111111111111111111') {
      return { valid: false, error: 'Worker is zeros (System Program)', worker: worker.toBase58() };
    }
    
    if (expectedWorker && worker.toBase58() !== expectedWorker) {
      return { valid: false, error: 'Worker mismatch', expected: expectedWorker, actual: worker.toBase58() };
    }
    
    return { valid: true, worker: worker.toBase58() };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

export default {
  MAINNET_RPC,
  ESCROW_PROGRAM_ID,
  ARBITRATOR,
  getConnection,
  getBalance,
  requestAirdrop,
  getEscrowPDA,
  taskIdToBytes,
  buildCreateEscrowTransaction,
  buildReleaseTransaction,
  buildDisputeTransaction,
  buildCancelTransaction,
  checkEscrowFunding,
  getEscrowData,
  verifyEscrow,
};
