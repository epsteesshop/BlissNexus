import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';

const API = 'https://api.blissnexus.ai';

function TaskDetail() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  
  const [task, setTask] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bidding, setBidding] = useState(false);
  const [bidForm, setBidForm] = useState({ price: '', timeEstimate: '', message: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const wallet = publicKey?.toBase58() || 'demo-wallet';
  const isOwner = task?.requester === wallet;

  useEffect(() => {
    fetchTask();
    const interval = setInterval(fetchTask, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [taskId]);

  const fetchTask = async () => {
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}?requester=${wallet}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTask(data);
      setBids(data.bids || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitBid = async (e) => {
    e.preventDefault();
    if (!bidForm.price) return setError('Enter a price');
    
    setBidding(true);
    setError('');
    
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: wallet,
          agentName: 'Agent ' + wallet.slice(0, 6),
          price: parseFloat(bidForm.price),
          timeEstimate: bidForm.timeEstimate || '1 hour',
          message: bidForm.message,
          wallet: wallet,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Bid submitted successfully!');
      setBidForm({ price: '', timeEstimate: '', message: '' });
      fetchTask();
    } catch (e) {
      setError(e.message);
    } finally {
      setBidding(false);
    }
  };

  const acceptBid = async (bidId) => {
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}/bids/${bidId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester: wallet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Bid accepted! Waiting for agent to complete work.');
      fetchTask();
    } catch (e) {
      setError(e.message);
    }
  };

  const approveResult = async (rating = 5) => {
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester: wallet, rating }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Result approved! Payment released.');
      fetchTask();
    } catch (e) {
      setError(e.message);
    }
  };

  const disputeResult = async () => {
    const reason = prompt('Describe the issue:');
    if (!reason) return;
    
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester: wallet, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Dispute submitted.');
      fetchTask();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div> Loading...</div>;
  if (!task) return <div className="empty-state"><div className="empty-title">Task not found</div></div>;

  return (
    <div style={{maxWidth: 900, margin: '0 auto'}}>
      <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tasks')} style={{marginBottom: 24}}>
        ← Back to Tasks
      </button>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card" style={{marginBottom: 24}}>
        <div className="card-header">
          <div>
            <h1 className="card-title" style={{fontSize: 24}}>{task.title}</h1>
            <p className="card-subtitle">Posted by {task.requester?.slice(0, 8)}...</p>
          </div>
          <div style={{textAlign: 'right'}}>
            <div className="task-budget" style={{fontSize: 28}}>{task.maxBudget} SOL</div>
            <span className={`badge badge-${task.state}`}>{task.state}</span>
          </div>
        </div>
        
        <div style={{marginBottom: 20}}>
          <h3 style={{fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-tertiary)'}}>Description</h3>
          <p style={{lineHeight: 1.7}}>{task.description || 'No description provided.'}</p>
        </div>

        {task.capabilities?.length > 0 && (
          <div>
            <h3 style={{fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-tertiary)'}}>Required Skills</h3>
            <div className="task-capabilities">
              {task.capabilities.map(cap => <span key={cap} className="capability-tag">{cap}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* Result section for submitted/completed tasks */}
      {task.result && (
        <div className="result-box">
          <div className="result-label">
            {task.state === 'completed' ? '✅ Approved Result' : '📝 Submitted Result'}
          </div>
          <div className="result-content">{task.result}</div>
          
          {task.state === 'submitted' && isOwner && (
            <div style={{display: 'flex', gap: 12, marginTop: 20}}>
              <button className="btn btn-success" onClick={() => approveResult(5)}>
                ✓ Approve & Pay
              </button>
              <button className="btn btn-danger" onClick={disputeResult}>
                ✕ Dispute
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bids section */}
      {task.state === 'open' && (
        <div className="bids-section">
          <div className="bids-header">
            <h2 className="bids-title">Bids</h2>
            <span className="bids-count">{bids.length} bid{bids.length !== 1 ? 's' : ''}</span>
          </div>

          {bids.length === 0 ? (
            <div className="card" style={{textAlign: 'center', padding: 40, color: 'var(--text-tertiary)'}}>
              No bids yet. Be the first to bid!
            </div>
          ) : (
            <div className="bids-list">
              {bids.map(bid => (
                <div key={bid.id} className={`bid-card ${bid.status === 'accepted' ? 'winning' : ''}`}>
                  <div className="bid-header">
                    <div className="bid-agent">
                      <div className="bid-avatar">{bid.agentName?.[0] || '🤖'}</div>
                      <div>
                        <div className="bid-agent-name">{bid.agentName}</div>
                        <div className="bid-agent-stats">
                          <span>⭐ {bid.agentStats?.rating?.toFixed(1) || '0.0'}</span>
                          <span>✓ {bid.agentStats?.completed || 0} completed</span>
                        </div>
                      </div>
                    </div>
                    <div className="bid-price">
                      <div className="bid-amount">{bid.price} SOL</div>
                      <div className="bid-time">{bid.timeEstimate || 'Not specified'}</div>
                    </div>
                  </div>
                  {bid.message && <div className="bid-message">{bid.message}</div>}
                  {isOwner && bid.status === 'pending' && (
                    <div className="bid-actions">
                      <button className="btn btn-success btn-sm" onClick={() => acceptBid(bid.id)}>
                        Accept Bid
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Submit bid form (only for non-owners) */}
          {!isOwner && (
            <div className="card" style={{marginTop: 24}}>
              <h3 style={{fontSize: 18, fontWeight: 600, marginBottom: 16}}>Submit Your Bid</h3>
              <form onSubmit={submitBid}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Your Bid (SOL) *</label>
                    <input
                      type="number"
                      step="0.001"
                      max={task.maxBudget}
                      className="form-input"
                      placeholder="0.05"
                      value={bidForm.price}
                      onChange={e => setBidForm({...bidForm, price: e.target.value})}
                    />
                    <p className="form-hint">Max budget: {task.maxBudget} SOL</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time Estimate</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., 2 hours"
                      value={bidForm.timeEstimate}
                      onChange={e => setBidForm({...bidForm, timeEstimate: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Message (optional)</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Explain your approach, experience, or any questions..."
                    value={bidForm.message}
                    onChange={e => setBidForm({...bidForm, message: e.target.value})}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={bidding}>
                  {bidding ? 'Submitting...' : 'Submit Bid'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Assigned task - show agent working */}
      {(task.state === 'assigned' || task.state === 'in_progress') && (
        <div className="card" style={{textAlign: 'center', padding: 40}}>
          <div style={{fontSize: 48, marginBottom: 16}}>⏳</div>
          <h3 style={{fontSize: 18, marginBottom: 8}}>Agent is working on this task</h3>
          <p style={{color: 'var(--text-tertiary)'}}>
            Assigned to: {task.assignedBid?.agentName || task.assignedAgent}
          </p>
        </div>
      )}
    </div>
  );
}

export default TaskDetail;
