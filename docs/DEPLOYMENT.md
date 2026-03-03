# Deployment Guide

## Railway Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ESCROW_WALLET_SECRET` | Yes | Base64 escrow keypair |
| `ADMIN_API_KEY` | Yes | Admin API key for protected endpoints |
| `SOLANA_RPC` | No | Custom Solana RPC (default: mainnet-beta) |
| `ALERT_WEBHOOK_URL` | No | Discord/Slack webhook for alerts |
| `SETTLEMENT_INTERVAL_MS` | No | Batch settlement interval (default: 1hr) |
| `MIN_PAYOUT_SOL` | No | Minimum payout threshold (default: 0.001) |

### Custom Domains

1. Go to Railway dashboard → Service → Settings → Domains
2. Add custom domain (e.g., `api.blissnexus.ai`)
3. Configure DNS:
   - CNAME: `api.blissnexus.ai` → `blissnexus-beacon-production.up.railway.app`
4. SSL is automatic via Railway

### Multi-Region Setup

Deploy to multiple regions for low latency:

```bash
# US (primary)
railway up --service blissnexus-beacon

# EU 
BEACON_ID=eu-west-1 BEACON_REGION=EU railway up --service beacon-eu

# Asia
BEACON_ID=ap-southeast-1 BEACON_REGION=Asia railway up --service beacon-asia
```

Configure peering via `PEER_BEACONS` env var.
