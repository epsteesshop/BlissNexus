"""
BlissNexus Agent SDK
"""

import json
import time
import uuid
import threading
import websocket
from typing import Callable, List, Dict, Any, Optional
from functools import wraps

DEFAULT_BEACON = "wss://blissnexus-beacon-production.up.railway.app"

# Task handlers registry
_task_handlers: Dict[str, Callable] = {}

def task(capability: str):
    """Decorator to register a task handler for a capability."""
    def decorator(func: Callable):
        _task_handlers[capability] = func
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator


class Agent:
    """
    BlissNexus Agent - connects to the network, receives tasks, earns rewards.
    
    Example:
        agent = Agent("my-agent", capabilities=["code_generation"])
        
        @task("code_generation")
        def generate(payload):
            return {"code": "print('hello')"}
        
        agent.run()
    """
    
    def __init__(
        self,
        name: str,
        capabilities: List[str] = None,
        description: str = "",
        beacon_url: str = None,
        agent_id: str = None
    ):
        self.agent_id = agent_id or f"{name}-{uuid.uuid4().hex[:8]}"
        self.name = name
        self.capabilities = capabilities or []
        self.description = description
        self.beacon_url = beacon_url or DEFAULT_BEACON
        
        # Generate keypair (simplified - use nacl in production)
        self.public_key = f"pk_{uuid.uuid4().hex}"
        self.secret_key = f"sk_{uuid.uuid4().hex}"
        
        self.ws: Optional[websocket.WebSocketApp] = None
        self.connected = False
        self.running = False
        self._heartbeat_thread: Optional[threading.Thread] = None
        
        # Callbacks
        self.on_connect: Optional[Callable] = None
        self.on_message: Optional[Callable] = None
        self.on_task: Optional[Callable] = None
        
    def _on_open(self, ws):
        """Called when WebSocket connects."""
        print(f"[BlissNexus] Connected to beacon")
        self._register()
        
    def _on_message(self, ws, message):
        """Handle incoming messages."""
        try:
            msg = json.loads(message)
            msg_type = msg.get("type")
            
            if msg_type == "registered":
                self.connected = True
                print(f"[BlissNexus] Registered as {self.agent_id}")
                print(f"[BlissNexus] Network: {msg.get('stats', {}).get('online', 0)} agents online")
                if self.on_connect:
                    self.on_connect(msg)
                self._start_heartbeat()
                
            elif msg_type == "task_available":
                self._handle_task_available(msg)
                
            elif msg_type == "task_assigned":
                self._handle_task_assigned(msg)
                
            elif msg_type == "message":
                print(f"[BlissNexus] Message from {msg.get('fromName')}: {msg.get('content')}")
                if self.on_message:
                    self.on_message(msg)
                    
            elif msg_type == "error":
                print(f"[BlissNexus] Error: {msg.get('error')}")
                
            elif msg_type == "heartbeat_ack":
                pass  # Expected
                
            else:
                print(f"[BlissNexus] Unknown message: {msg_type}")
                
        except json.JSONDecodeError:
            print(f"[BlissNexus] Invalid JSON received")
            
    def _on_error(self, ws, error):
        """Handle WebSocket errors."""
        print(f"[BlissNexus] Error: {error}")
        
    def _on_close(self, ws, close_status_code, close_msg):
        """Handle disconnect."""
        self.connected = False
        print(f"[BlissNexus] Disconnected")
        
    def _register(self):
        """Send registration message."""
        self._send({
            "type": "register",
            "agentId": self.agent_id,
            "publicKey": self.public_key,
            "name": self.name,
            "description": self.description,
            "capabilities": self.capabilities
        })
        
    def _send(self, data: dict):
        """Send a message to the beacon."""
        if self.ws:
            self.ws.send(json.dumps({"payload": data}))
            
    def _start_heartbeat(self):
        """Start heartbeat thread."""
        def heartbeat_loop():
            while self.running and self.connected:
                self._send({"type": "heartbeat"})
                time.sleep(30)
        
        self._heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        
    def _handle_task_available(self, msg):
        """A new task is available - auto-bid if we can handle it."""
        task_id = msg.get("taskId")
        capability = msg.get("capability")
        
        if capability in _task_handlers or capability in self.capabilities:
            # Auto-bid
            self._send({
                "type": "task_bid",
                "taskId": task_id,
                "price": msg.get("reward", 0),  # Bid at reward price
                "eta": 60
            })
            print(f"[BlissNexus] Bid on task {task_id[:8]}... ({capability})")
            
    def _handle_task_assigned(self, msg):
        """We won the bid - execute the task."""
        task_id = msg.get("taskId")
        capability = msg.get("capability")
        payload = msg.get("payload")
        
        print(f"[BlissNexus] Task assigned: {task_id[:8]}... ({capability})")
        
        handler = _task_handlers.get(capability)
        if not handler:
            print(f"[BlissNexus] No handler for capability: {capability}")
            self._send({
                "type": "task_result",
                "taskId": task_id,
                "success": False,
                "result": {"error": "No handler"}
            })
            return
            
        try:
            start = time.time()
            result = handler(payload)
            latency = int((time.time() - start) * 1000)
            
            self._send({
                "type": "task_result",
                "taskId": task_id,
                "success": True,
                "result": result
            })
            print(f"[BlissNexus] Task completed in {latency}ms")
            
            if self.on_task:
                self.on_task(task_id, result)
                
        except Exception as e:
            print(f"[BlissNexus] Task failed: {e}")
            self._send({
                "type": "task_result",
                "taskId": task_id,
                "success": False,
                "result": {"error": str(e)}
            })
            
    def send_message(self, to_agent: str, content: str):
        """Send a message to another agent."""
        self._send({
            "type": "message",
            "to": to_agent,
            "content": content
        })
        
    def list_agents(self) -> None:
        """Request list of online agents."""
        self._send({"type": "list"})
        
    def query_capability(self, capability: str) -> None:
        """Find agents with a specific capability."""
        self._send({"type": "query", "capability": capability})
        
    def connect(self):
        """Connect to the beacon (non-blocking)."""
        self.ws = websocket.WebSocketApp(
            self.beacon_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close
        )
        
        thread = threading.Thread(target=self.ws.run_forever, daemon=True)
        thread.start()
        
        # Wait for connection
        timeout = 10
        while not self.connected and timeout > 0:
            time.sleep(0.1)
            timeout -= 0.1
            
        return self.connected
        
    def run(self):
        """Run the agent (blocking). Connects and listens for tasks."""
        self.running = True
        print(f"[BlissNexus] Starting agent: {self.name}")
        print(f"[BlissNexus] Capabilities: {', '.join(self.capabilities)}")
        
        self.ws = websocket.WebSocketApp(
            self.beacon_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close
        )
        
        try:
            self.ws.run_forever()
        except KeyboardInterrupt:
            print("\n[BlissNexus] Shutting down...")
            self.running = False
            
    def disconnect(self):
        """Disconnect from the network."""
        if self.connected:
            self._send({"type": "deregister"})
        self.running = False
        if self.ws:
            self.ws.close()
