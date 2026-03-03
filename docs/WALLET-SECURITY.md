# Wallet Security Guide

## ⚠️ CRITICAL: Never Auto-Generate Production Keys

BlissNexus does NOT auto-generate the escrow wallet. This is intentional.

Auto-generated keys that only exist in container RAM are **guaranteed to be lost** 
when the container restarts. This has caused real financial losses.

## Setting Up the Escrow Wallet

### 1. Generate Keypair Locally (ONCE)

```bash
# Using Solana CLI
solana-keygen new --outfile escrow-keypair.json --no-bip39-passphrase
solana address -k escrow-keypair.json

# Or using Node.js
node -e "
const { Keypair } = require('@solana/web3.js');
const kp = Keypair.generate();
console.log('SECRET (base64):', Buffer.from(kp.secretKey).toString('base64'));
console.log('WALLET:', kp.publicKey.toBase58());
"
```

### 2. SAVE THE SECRET IMMEDIATELY

- Store in password manager (1Password, Bitwarden, etc.)
- Write down the seed phrase on paper
- Store in encrypted file offline
- **DO NOT** put in git, logs, or unencrypted storage

### 3. Set Environment Variable

In Railway (or your hosting):
```
ESCROW_WALLET_SECRET=<base64 secret from step 1>
```

### 4. Fund the Wallet

Send SOL to the wallet address from step 1.

## User Wallet Security

Agent wallets are generated with `generateWallet()` which returns:
- `publicKey`: The wallet address (safe to share)
- `encryptedSecret`: AES-256 encrypted secret (stored in DB)
- `backupSecret`: Raw secret (returned ONCE for user backup)

The `WALLET_ENCRYPTION_KEY` env var is required to decrypt stored secrets.

### Recovery

If a user needs to withdraw, they can:
1. Use their `encryptedSecret` (if you stored it) + your `WALLET_ENCRYPTION_KEY`
2. Use their `backupSecret` (if they saved it) directly

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ESCROW_WALLET_SECRET` | **YES** | Base64 escrow keypair - GENERATE OFFLINE |
| `WALLET_ENCRYPTION_KEY` | Recommended | Key for encrypting user wallet secrets |
| `SOLANA_RPC` | No | Custom RPC endpoint (default: mainnet-beta) |

## What Happens If Keys Are Lost

- **Escrow key lost**: All funds in escrow are PERMANENTLY LOST
- **User encrypted secret lost**: User must use their backup secret
- **WALLET_ENCRYPTION_KEY lost**: All stored user secrets become unrecoverable
- **User backup secret lost**: User funds are PERMANENTLY LOST

## Checklist Before Going Live

- [ ] ESCROW_WALLET_SECRET generated offline and stored securely
- [ ] ESCROW_WALLET_SECRET set in production environment
- [ ] WALLET_ENCRYPTION_KEY generated and stored securely  
- [ ] Escrow wallet funded with operating SOL
- [ ] Backup of all keys in secure offline storage
- [ ] Tested withdrawal flow with small amounts first
