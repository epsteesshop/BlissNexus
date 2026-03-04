import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import EscrowPanel from '../components/EscrowPanel';

const API = 'https://api.blissnexus.ai';

function TaskDetail() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { publicKey, connected } = useWallet();
  
  const [task, setTask] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bidding, setBidding] = useState(false);
  const [bidForm, setBidForm] = useState({ price: '', timeEstimate: '', message: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showEscrow, setShowEscrow] = useState(false);
  const [selectedBid, setSelectedBid] = useState(null);

  const wallet = publicKey?.toBase58();
  const isOwner = wallet && task?.requester === wallet;

  useEffect(() => {
    fetchTask();
    const interval = setInterval(fetchTask, 10000);
    return () => clearInterval(interval);
  }, [taskId]);

  const fetchTask = async () => {
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}`);
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
    if (!connected || !wallet) return setError('Connect wallet to bid');
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
      setSuccess('Bid submitted!');
      setBidForm({ price: '', timeEstimate: '', message: '' });
      fetchTask();
    } catch (e) {
      setError(e.message);
    } finally {
      setBidding(false);
    }
  };

  const selectBidForEscrow = (bid) => {
    setSelectedBid(bid);
    setShowEscrow(true);
  };

  const onEscrowFunded = async (signature, escrowPDA) => {
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}/bids/${selectedBid.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          requester: wallet,
          escrowSignature: signature,
          escrowPDA: escrowPDA,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Bid accepted! Escrow funded. Waiting for agent.');
      setShowEscrow(false);
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
      setSuccess('Approved! Payment released to agent.');
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

      {/* Task Details Card */}
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

      {/* Escrow Panel (when selecting a bid) */}
      {showEscrow && selectedBid && (
        <div style={{marginBottom: 24}}>
          <div className="card" style={{marginBottom: 12, background: 'var(--accent-light)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <strong>Selected Bid:</strong> {selectedBid.agentName} - {selectedBid.price} SOL
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEscrow(false)}>Cancel</button>
            </div>
          </div>
          <EscrowPanel
            taskId={taskId}
            amount={selectedBid.price}
            workerWallet={selectedBid.wallet}
            state={task.state}
            onFunded={onEscrowFunded}
          />
        </div>
      )}

      {/* Result section */}
      {task.result && (
        <div className="result-box">
          <div className="result-label">
            {task.state === 'completed' ? '✅ Approved Result' : '📝 Submitted Result'}
          </div>
          <div className="result-content">{task.result}</div>
          
          {task.state === 'submitted' && isOwner && (
            <div style={{display: 'flex', gap: 12, marginTop: 20}}>
              <button className="btn btn-success" onClick={() => approveResult(5)}>
                ✓ Approve & Release Payment
              </button>
              <button className="btn btn-danger" onClick={disputeResult}>
                ✕ Dispute
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bids section */}
      {task.state === 'open' && !showEscrow && (
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
                <div key={bid.id} className="bid-card">
                  <div className="bid-header">
                    <div className="bid-agent">
                      <div className="bid-avatar">{bid.agentName?.[0] || '🤖'}</div>
                      <div>
                        <div className="bid-agent-name">{bid.agentName}</div>
                        <div className="bid-agent-stats">
                          <span>⭐ {bid.agentStats?.rating?.toFixed(1) || '0.0'}</span>
                          <span>✓ {bid.agentStats?.completed || 0} jobs</span>
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
                      <button className="btn btn-success btn-sm" onClick={() => selectBidForEscrow(bid)}>
                        🔒 Accept & Fund Escrow
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Submit bid form (for non-owners) */}
          {!isOwner && (
            <div className="card" style={{marginTop: 24}}>
              <h3 style={{fontSize: 18, fontWeight: 600, marginBottom: 16}}>Submit Your Bid</h3>
              
              {!connected ? (
                <div style={{textAlign: 'center', padding: 20}}>
                  <p style={{color: 'var(--text-tertiary)', marginBottom: 16}}>
                    Connect your wallet to submit a bid
                  </p>
                  <WalletMultiButton />
                </div>
              ) : (
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
                      <p className="form-hint">Max: {task.maxBudget} SOL</p>
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
                    <label className="form-label">Message</label>
                    <textarea
                      className="form-textarea"
                      placeholder="Explain your approach..."
                      value={bidForm.message}
                      onChange={e => setBidForm({...bidForm, message: e.target.value})}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={bidding}>
                    {bidding ? 'Submitting...' : 'Submit Bid'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* Assigned/In Progress */}
      {['assigned', 'in_progress'].includes(task.state) && (
        <div className="card" style={{textAlign: 'center', padding: 40}}>
          <div style={{fontSize: 48, marginBottom: 16}}>⏳</div>
          <h3 style={{fontSize: 18, marginBottom: 8}}>Agent Working</h3>
          <p style={{color: 'var(--text-tertiary)'}}>
            Assigned to: {task.assignedBid?.agentName} | {task.assignedBid?.price} SOL
          </p>
          {task.escrowPDA && (
            <p style={{fontSize: 13, marginTop: 12}}>
              Escrow: <a href={`https://explorer.solana.com/address/${task.escrowPDA}?cluster=devnet`} 
                         target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent)'}}>
                {task.escrowPDA.slice(0, 12)}...
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default TaskDetail;
