const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const crypto = require('crypto');

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC, 'confirmed');
const ENCRYPT_KEY = process.env.WALLET_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

let escrowKeypair = null;
let escrowInitialized = false;

function encrypt(text) {
  const key = crypto.scryptSync(ENCRYPT_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

function decrypt(encrypted) {
  const key = crypto.scryptSync(ENCRYPT_KEY, 'salt', 32);
  const [ivHex, encData] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return decipher.update(encData, 'hex', 'utf8') + decipher.final('utf8');
}

function initEscrow() {
  const secret = process.env.ESCROW_WALLET_SECRET;
  
  if (!secret) {
    // CRITICAL: Do NOT auto-generate. Fail loud and clear.
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  FATAL: ESCROW_WALLET_SECRET environment variable not set!   ║');
    console.error('║                                                              ║');
    console.error('║  To generate a new escrow wallet, run:                       ║');
    console.error('║    node -e "const{Keypair}=require(\'@solana/web3.js\');       ║');
    console.error('║    const kp=Keypair.generate();                              ║');
    console.error('║    console.log(Buffer.from(kp.secretKey).toString(\'base64\'));║');
    console.error('║    console.log(\'Wallet:\',kp.publicKey.toBase58())"           ║');
    console.error('║                                                              ║');
    console.error('║  Then set ESCROW_WALLET_SECRET in Railway environment vars.  ║');
    console.error('║  SAVE THE SECRET SECURELY - loss means loss of funds!        ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    escrowInitialized = false;
    return false;
  }
  
  try {
    escrowKeypair = Keypair.fromSecretKey(Buffer.from(secret, 'base64'));
    console.log('[Solana] ✅ Escrow wallet loaded:', escrowKeypair.publicKey.toBase58());
    escrowInitialized = true;
    return true;
  } catch (e) {
    console.error('[Solana] ❌ Invalid ESCROW_WALLET_SECRET:', e.message);
    escrowInitialized = false;
    return false;
  }
}

function isEscrowReady() {
  return escrowInitialized && escrowKeypair !== null;
}

function generateWallet() {
  const kp = Keypair.generate();
  const secretBase64 = Buffer.from(kp.secretKey).toString('base64');
  
  return {
    publicKey: kp.publicKey.toBase58(),
    // Encrypted secret - stored in DB, decryptable only with WALLET_ENCRYPTION_KEY
    encryptedSecret: encrypt(secretBase64),
    // WARNING: This is returned once. If user loses it, funds are LOST.
    // In production, consider NOT returning this and only storing encrypted.
    backupSecret: secretBase64
  };
}

function recoverWallet(encryptedSecret) {
  try {
    const secretBase64 = decrypt(encryptedSecret);
    const kp = Keypair.fromSecretKey(Buffer.from(secretBase64, 'base64'));
    return { publicKey: kp.publicKey.toBase58(), keypair: kp };
  } catch (e) {
    return { error: 'Failed to decrypt wallet: ' + e.message };
  }
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
      escrowReady: isEscrowReady(),
      escrowWallet: escrowKeypair?.publicKey.toBase58() || null,
      escrowBalance: escrowKeypair ? await getBalance(escrowKeypair.publicKey.toBase58()) : 0
    };
  } catch (e) {
    return { connected: false, escrowReady: isEscrowReady(), error: e.message };
  }
}

async function payAgent(toPublicKey, amountSol) {
  if (!isEscrowReady()) {
    return { success: false, error: 'Escrow not initialized - ESCROW_WALLET_SECRET not set' };
  }
  
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

async function agentWithdraw(agentPubkey, encryptedSecret, toWallet, amount) {
  // Recover agent's wallet from encrypted secret
  const recovered = recoverWallet(encryptedSecret);
  if (recovered.error) {
    return { success: false, error: recovered.error };
  }
  
  const balance = await getBalance(recovered.publicKey);
  if (balance < amount) {
    return { success: false, error: 'Insufficient balance' };
  }
  
  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: recovered.keypair.publicKey,
        toPubkey: new PublicKey(toWallet),
        lamports: Math.floor(amount * LAMPORTS_PER_SOL)
      })
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [recovered.keypair]);
    return { success: true, signature: sig, amount };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { 
  initEscrow, 
  isEscrowReady,
  generateWallet, 
  recoverWallet,
  getBalance, 
  getStatus, 
  payAgent,
  agentWithdraw
};
