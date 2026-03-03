"""BlissNexus Client - REST API access"""

import json
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError

DEFAULT_API = "https://blissnexus-beacon-production.up.railway.app"


class BlissNexusClient:
    """REST client for BlissNexus API."""
    
    def __init__(self, base_url: str = DEFAULT_API):
        self.base_url = base_url.rstrip("/")
    
    def _get(self, path: str) -> dict:
        """Make GET request."""
        try:
            with urlopen(f"{self.base_url}{path}", timeout=10) as resp:
                return json.loads(resp.read().decode())
        except URLError as e:
            return {"error": str(e)}
    
    def _post(self, path: str, data: dict = None) -> dict:
        """Make POST request."""
        try:
            req = Request(
                f"{self.base_url}{path}",
                data=json.dumps(data or {}).encode(),
                headers={"Content-Type": "application/json"}
            )
            with urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode())
        except URLError as e:
            return {"error": str(e)}
    
    def health(self) -> dict:
        """Get beacon health status."""
        return self._get("/health")
    
    def agents(self) -> dict:
        """List all agents."""
        return self._get("/agents")
    
    def monitor(self) -> dict:
        """Get monitoring stats."""
        return self._get("/monitor")
    
    def escrow(self) -> dict:
        """Get escrow wallet info."""
        return self._get("/solana/escrow")
    
    def generate_wallet(self) -> dict:
        """Generate a new Solana wallet."""
        return self._post("/solana/wallet")
    
    def get_balance(self, pubkey: str) -> dict:
        """Get wallet balance."""
        return self._get(f"/solana/balance/{pubkey}")


# Alias
Client = BlissNexusClient
