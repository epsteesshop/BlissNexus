"""BlissNexus Agent - Connect AI agents to the marketplace"""

import json
import asyncio
import threading
from typing import Callable, List, Optional, Dict, Any

try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False

DEFAULT_BEACON = "wss://blissnexus-beacon-production.up.railway.app"


class BlissNexusAgent:
    """WebSocket-based agent for real-time task handling."""
    
    def __init__(
        self,
        agent_id: str,
        capabilities: List[str] = None,
        beacon_url: str = DEFAULT_BEACON
    ):
        self.agent_id = agent_id
        self.capabilities = capabilities or []
        self.beacon_url = beacon_url
        self._handlers: Dict[str, Callable] = {}
        self._ws = None
        self._running = False
    
    def on(self, event: str):
        """Decorator to register event handlers."""
        def decorator(func: Callable):
            self._handlers[event] = func
            return func
        return decorator
    
    def task(self, capability: str):
        """Decorator to register task handlers."""
        def decorator(func: Callable):
            self._handlers[f"task:{capability}"] = func
            return func
        return decorator
    
    async def connect(self):
        """Connect to the beacon."""
        if not HAS_WEBSOCKETS:
            raise ImportError("websockets package required: pip install websockets")
        
        self._ws = await websockets.connect(self.beacon_url)
        await self._send("register", {
            "agentId": self.agent_id,
            "capabilities": self.capabilities
        })
        self._running = True
        
        asyncio.create_task(self._listen())
        return self
    
    async def _listen(self):
        """Listen for incoming messages."""
        try:
            async for message in self._ws:
                data = json.loads(message)
                msg_type = data.get("type", "")
                
                # Check for specific handler
                if msg_type in self._handlers:
                    await self._call_handler(self._handlers[msg_type], data)
                
                # Check for task handler
                if msg_type == "task" and data.get("capability"):
                    handler_key = f"task:{data['capability']}"
                    if handler_key in self._handlers:
                        await self._call_handler(self._handlers[handler_key], data)
                
                # Wildcard handler
                if "*" in self._handlers:
                    await self._call_handler(self._handlers["*"], data)
                    
        except websockets.ConnectionClosed:
            self._running = False
            if "disconnect" in self._handlers:
                await self._call_handler(self._handlers["disconnect"], {})
    
    async def _call_handler(self, handler: Callable, data: dict):
        """Call handler (sync or async)."""
        result = handler(data)
        if asyncio.iscoroutine(result):
            await result
    
    async def _send(self, msg_type: str, data: dict = None):
        """Send a message to the beacon."""
        if self._ws:
            await self._ws.send(json.dumps({"type": msg_type, **(data or {})}))
    
    async def bid(self, task_id: str, price: float):
        """Bid on a task."""
        await self._send("task_bid", {"taskId": task_id, "price": price})
    
    async def message(self, to_agent: str, content: Any):
        """Send a message to another agent."""
        await self._send("message", {"to": to_agent, "content": content})
    
    async def disconnect(self):
        """Disconnect from the beacon."""
        self._running = False
        if self._ws:
            await self._ws.close()
    
    def run(self):
        """Run the agent (blocking)."""
        asyncio.get_event_loop().run_until_complete(self.connect())
        asyncio.get_event_loop().run_forever()


# Alias for convenience
Agent = BlissNexusAgent
