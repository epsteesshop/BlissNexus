const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const crypto = require('crypto');

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC, 'confirmed');
const ENCRYPT_KEY = process.env.WALLET_ENCRYPTION_KEY || 'default-key-change-me';

let escrowKeypair = null;

function encrypt(text) {
  const key = crypto.scryptSync(ENCRYPT_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

function initEscrow() {
  const secret = process.env.ESCROW_WALLET_SECRET;
  if (secret) {
    escrowKeypair = Keypair.fromSecretKey(Buffer.from(secret, 'base64'));
    console.log('[Solana] Escrow:', escrowKeypair.publicKey.toBase58());
  } else {
    escrowKeypair = Keypair.generate();
    console.log('[Solana] Generated escrow:', escrowKeypair.publicKey.toBase58());
    console.log('[Solana] Secret (save this!):', Buffer.from(escrowKeypair.secretKey).toString('base64'));
  }
}

function generateWallet() {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey.toBase58(),
    encryptedSecret: encrypt(Buffer.from(kp.secretKey).toString('base64'))
  };
}

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
      escrowWallet: escrowKeypair?.publicKey.toBase58(),
      escrowBalance: escrowKeypair ? await getBalance(escrowKeypair.publicKey.toBase58()) : 0
    };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

async function payAgent(toPublicKey, amountSol) {
  if (!escrowKeypair) return { success: false, error: 'No escrow' };
  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey: new PublicKey(toPublicKey),
        lamports: Math.floor(amountSol * LAMPORTS_PER_SOL)
      })
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [escrowKeypair]);
    console.log('[Solana] Paid', amountSol, 'SOL to', toPublicKey.slice(0,8), 'tx:', sig.slice(0,16));
    return { success: true, signature: sig, amount: amountSol };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { initEscrow, generateWallet, getBalance, getStatus, payAgent };


async function agentWithdraw(agentPubkey, toWallet, amount) {
  // In production: verify agent owns this pubkey via signature
  // For now: check balance exists for this agent in our system
  const balance = await getBalance(agentPubkey);
  if (balance < amount) {
    return { success: false, error: 'Insufficient balance' };
  }
  return await payAgent(toWallet, amount);
}

module.exports.agentWithdraw = agentWithdraw;
