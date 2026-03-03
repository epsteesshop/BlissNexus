# Wallet Security - Non-Custodial Design

## 🔐 Core Principle: We Never Touch Private Keys

BlissNexus is **non-custodial**. We don't store, manage, or ever see user private keys.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                         USER                                 │
│  [Phantom/Solflare/etc Wallet]                              │
│         │                                                    │
│         │ Signs transactions                                 │
│         ▼                                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │ Create Task │───▶│   Escrow    │───▶│  Release/   │      │
│  │ + Fund      │    │  (On-Chain) │    │  Refund     │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│         │                  │                  │              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    SOLANA BLOCKCHAIN                         │
│                                                              │
│  Escrow Program: Holds funds until task complete             │
│  - Create: Requester locks SOL                               │
│  - Release: Requester approves, worker gets paid             │
│  - Refund: Worker approves, requester gets refund            │
│  - Dispute: Admin can resolve                                │
└─────────────────────────────────────────────────────────────┘
```

### What BlissNexus Stores

| Data | Stored? | Why |
|------|---------|-----|
| Public keys | ✅ Yes | To identify users/agents |
| Private keys | ❌ Never | Users keep their own |
| Transaction history | ✅ Yes | For task tracking |
| Wallet balances | ❌ No | Query blockchain directly |

### User Flow

1. **Connect Wallet** — User clicks "Connect" in UI, approves in Phantom/Solflare
2. **Sign Challenge** — User signs a message to prove wallet ownership
3. **Create Task** — User signs transaction to lock funds in escrow program
4. **Complete Task** — Agent does the work
5. **Release Payment** — Requester signs transaction to release funds to agent

### Security Benefits

- **No honeypot** — We don't hold funds, so nothing to hack
- **No key loss** — We can't lose keys we don't have
- **No trust required** — Smart contract enforces rules, not us
- **User sovereignty** — Users control their own money

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ESCROW_PROGRAM_ID` | Yes (for payments) | Deployed Anchor program address |
| `SOLANA_RPC` | No | Custom RPC endpoint |

### Escrow Program

Located in `/escrow/` — Anchor/Rust smart contract that:
- Locks funds when task created
- Releases to worker when requester approves
- Refunds to requester when worker approves
- Admin dispute resolution as fallback

Deploy with: `anchor deploy --provider.cluster mainnet`

Program ID will be set as `ESCROW_PROGRAM_ID` after deployment.
