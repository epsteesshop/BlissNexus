import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';

export default function TaskDetail() {
  const { id } = useParams();
  const { publicKey } = useWallet();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v2/tasks/${id}`)
      .then(r => r.json())
      .then(data => {
        setTask(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const acceptBid = async (bidId) => {
    if (!publicKey) {
      alert('Connect your wallet first');
      return;
    }
    
    try {
      const res = await fetch(`/api/v2/tasks/${id}/bids/${bidId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester: publicKey.toString() })
      });
      
      const data = await res.json();
      if (data.error) {
        alert('Error: ' + data.error);
      } else {
        alert('Bid accepted!');
        window.location.reload();
      }
    } catch (err) {
      alert('Failed to accept bid');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="empty-state">
        <div className="icon">❓</div>
        <h3>Task Not Found</h3>
        <Link to="/tasks" className="btn btn-primary">Browse Tasks</Link>
      </div>
    );
  }

  const isOwner = publicKey?.toString() === task.requester;
  const statusColors = {
    open: { bg: 'var(--success-bg)', color: 'var(--success)' },
    assigned: { bg: 'var(--warning-bg)', color: 'var(--warning)' },
    completed: { bg: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent)' }
  };
  const status = statusColors[task.state] || statusColors.open;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Link to="/tasks" style={{ 
          color: 'var(--text-tertiary)', 
          textDecoration: 'none',
          fontSize: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 16
        }}>
          ← Back to Tasks
        </Link>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginBottom: 12 }}>{task.title}</h1>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                background: status.bg,
                color: status.color,
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'capitalize'
              }}>
                {task.state}
              </span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
                Posted {new Date(task.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          
          <div className="task-budget" style={{ fontSize: 20 }}>
            {task.maxBudget} SOL
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 32, alignItems: 'start' }}>
        {/* Main Content */}
        <div>
          {/* Description */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>📝</span> Description
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {task.description}
            </p>
          </div>

          {/* Capabilities */}
          {task.capabilities?.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>🎯</span> Required Skills
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {task.capabilities.map(cap => (
                  <span key={cap} className="task-tag">{cap}</span>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {task.attachments?.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>📎</span> Attachments
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {task.attachments.map((file, i) => (
                  <a
                    key={i}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    {file.contentType?.startsWith('image/') ? '🖼️' : '📄'}
                    {file.filename}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          {task.result && (
            <div className="card" style={{ borderColor: 'var(--success)', background: 'var(--success-bg)' }}>
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--success)' }}>
                <span>✅</span> Completed Result
              </h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {task.result}
              </p>
              
              {task.resultAttachments?.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-tertiary)' }}>Deliverables</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {task.resultAttachments.map((file, i) => (
                      <a key={i} href={file.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                        {file.contentType?.startsWith('image/') ? '🖼️' : '📄'} {file.filename}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar - Bids */}
        <div className="card" style={{ position: 'sticky', top: 100 }}>
          <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🏆</span> Bids ({task.bids?.length || 0})
          </h3>
          
          {!task.bids?.length ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '32px 0' }}>
              No bids yet. Be the first!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {task.bids.map(bid => (
                <div key={bid.id} style={{
                  padding: 16,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  transition: 'all var(--transition)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>{bid.agentName}</span>
                    <span style={{
                      background: 'var(--gradient-primary)',
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'white'
                    }}>
                      {bid.price} SOL
                    </span>
                  </div>
                  
                  {bid.message && (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                      {bid.message}
                    </p>
                  )}
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      ⏱️ {bid.timeEstimate}
                    </span>
                    
                    {isOwner && task.state === 'open' && (
                      <button
                        onClick={() => acceptBid(bid.id)}
                        className="btn btn-primary btn-sm"
                      >
                        Accept
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
