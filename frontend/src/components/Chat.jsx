import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export default function Chat({ taskId, task }) {
  const { publicKey } = useWallet();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatState, setChatState] = useState({ locked: true, readOnly: false, reason: '' });
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);

  const userId = publicKey?.toString();

  // Load initial messages
  useEffect(() => {
    const url = `/api/v2/tasks/${taskId}/messages${userId ? `?userId=${userId}` : ''}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        setMessages(data.messages || []);
        setChatState({
          locked: data.locked || false,
          readOnly: data.readOnly || false,
          reason: data.reason || '',
          status: data.status
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [taskId, userId]);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    if (chatState.locked) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat_message' && data.taskId === taskId) {
          setMessages(prev => [...prev, data.message]);
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, [taskId, chatState.locked]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending || chatState.readOnly) return;

    setSending(true);
    try {
      const res = await fetch(`/api/v2/tasks/${taskId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: userId,
          senderName: userId?.slice(0, 8),
          message: input.trim()
        })
      });

      if (res.ok) {
        setInput('');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to send');
      }
    } catch (err) {
      console.error('Failed to send message');
    }
    setSending(false);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isOwnMessage = (msg) => {
    return userId && msg.sender_id === userId;
  };

  // Locked state - show why chat isn't available
  if (chatState.locked) {
    return (
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '40px 24px',
        textAlign: 'center',
        background: 'var(--bg-secondary)',
        color: 'var(--text-tertiary)'
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Chat Locked</div>
        <div style={{ fontSize: 14 }}>{chatState.reason}</div>
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>
          Chat opens when a bid is accepted
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '400px',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      background: 'var(--bg-secondary)'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        💬 Task Chat
        <span style={{
          fontSize: 12,
          color: 'var(--text-tertiary)',
          fontWeight: 400
        }}>
          ({messages.length} messages)
        </span>
        {chatState.readOnly && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 11,
            padding: '4px 8px',
            background: 'var(--bg-tertiary)',
            borderRadius: 4,
            color: 'var(--text-tertiary)'
          }}>
            ✓ Completed - Read Only
          </span>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={msg.id || i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isOwnMessage(msg) ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                background: isOwnMessage(msg) 
                  ? 'var(--accent)' 
                  : 'var(--bg-tertiary)',
                color: isOwnMessage(msg) ? 'white' : 'var(--text-primary)',
              }}>
                {!isOwnMessage(msg) && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    marginBottom: 4,
                    color: isOwnMessage(msg) ? 'rgba(255,255,255,0.8)' : 'var(--accent)'
                  }}>
                    {msg.sender_name}
                  </div>
                )}
                <div style={{ fontSize: 14, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {msg.message}
                </div>
              </div>
              <div style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 4,
                paddingX: 4
              }}>
                {formatTime(msg.created_at)}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input - only show if not read-only */}
      {!chatState.readOnly ? (
        <form onSubmit={sendMessage} style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8
        }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={userId ? "Type a message..." : "Connect wallet to chat"}
            disabled={!userId || sending}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={!userId || !input.trim() || sending}
            style={{
              padding: '10px 20px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontWeight: 600,
              cursor: userId && input.trim() ? 'pointer' : 'not-allowed',
              opacity: userId && input.trim() ? 1 : 0.5
            }}
          >
            {sending ? '...' : 'Send'}
          </button>
        </form>
      ) : (
        <div style={{
          padding: '16px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: 13
        }}>
          This conversation has ended
        </div>
      )}
    </div>
  );
}
