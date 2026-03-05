import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import EscrowPanel from '../components/EscrowPanel';
import escrow from '../lib/escrow';
import Chat from '../components/Chat';
import Rating from '../components/Rating';

const API = 'https://api.blissnexus.ai';

function TaskDetail() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  
  const [task, setTask] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [bidding, setBidding] = useState(false);
  const [bidForm, setBidForm] = useState({ price: '', timeEstimate: '', message: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showEscrow, setShowEscrow] = useState(false);
  const [selectedBid, setSelectedBid] = useState(null);

  const wallet = publicKey?.toBase58();
  // Check multiple possible field names for requester
  const taskRequester = task?.requester || task?.requester_id || task?.requesterId;
  const isOwner = wallet && taskRequester === wallet;

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

  useEffect(() => {
    fetchTask();
    const interval = setInterval(fetchTask, 10000);
    return () => clearInterval(interval);
  }, [taskId]);

  const submitBid = async (e) => {
    e.preventDefault();
    if (!connected || !wallet) return setError('Connect wallet to bid');
    
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

  const approveResult = async (rating = 5) => {
    if (!task?.assignedBid?.wallet) {
      return setError('No agent wallet found');
    }
    
    setLoading(true);
    setError('');
    
    try {
      const { transaction } = await escrow.buildReleaseTransaction(
        wallet,
        taskId,
        task.assignedBid.wallet
      );
      
      const signature = await sendTransaction(transaction, connection);
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latestBlockhash });
      
      const res = await fetch(`${API}/api/v2/tasks/${taskId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester: wallet, rating, txSignature: signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setSuccess(`Approved! Payment released. TX: ${signature.slice(0, 16)}...`);
      fetchTask();
    } catch (e) {
      setError(e.message || 'Release failed');
    } finally {
      setLoading(false);
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
      setSuccess('Dispute filed.');
      fetchTask();
    } catch (e) {
      setError(e.message);
    }
  };

  const cancelTask = async () => {
    // Debug: immediate feedback
    alert('Cancel button clicked!');
    
    const confirmed = window.confirm('Are you sure you want to cancel this task?');
    if (!confirmed) return;
    
    setCancelling(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester: wallet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      navigate('/my-tasks');
    } catch (e) {
      alert('Error: ' + e.message);
      setError(e.message);
      setCancelling(false);
    }
  };

  const acceptBid = (bid) => {
    setSelectedBid(bid);
    setShowEscrow(true);
  };

  const onEscrowFunded = async (signature, escrowPDA) => {
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}/accept-bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidId: selectedBid.id,
          requester: wallet,
          escrowTx: signature,
          escrowPDA: escrowPDA,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Bid accepted!');
      setShowEscrow(false);
      fetchTask();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading && !task) {
    return <div className="loading"><div className="spinner"></div> Loading...</div>;
  }

  if (!task) {
    return <div className="empty-state"><div className="empty-title">Task not found</div></div>;
  }

  const stateColors = {
    open: 'badge-open',
    assigned: 'badge-assigned',
    in_progress: 'badge-in-progress',
    submitted: 'badge-submitted',
    completed: 'badge-completed',
    disputed: 'badge-disputed',
  };

  return (
    <div style={{maxWidth: 900, margin: '0 auto'}}>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card" style={{marginBottom: 24}}>
        <div className="card-header">
          <div>
            <h1 className="card-title" style={{fontSize: 22}}>{task.title}</h1>
            <span className={`badge ${stateColors[task.state] || ''}`} style={{marginTop: 8}}>
              {task.state?.replace('_', ' ')}
            </span>
            {task.state === 'open' && isOwner && (
              <button 
                type="button"
                className="btn btn-secondary btn-sm" 
                onClick={() => { alert("TEST"); }}
                disabled={cancelling}
                style={{marginLeft: 12}}
              >
                ❌ Cancel Task
              </button>
            )}
          </div>
          <div className="task-budget">{task.maxBudget} SOL<span> max</span></div>
        </div>

        <p style={{color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20}}>
          {task.description}
        </p>

        <div className="task-capabilities">
          {task.capabilities?.map(cap => (
            <span key={cap} className="capability-tag">{cap}</span>
          ))}
        </div>
      </div>

      {task.result && (
        <div className="card" style={{marginBottom: 24}}>
          <h2 style={{fontSize: 18, fontWeight: 600, marginBottom: 16}}>
            {task.state === 'completed' ? '✅ Approved Result' : '📝 Submitted Result'}
          </h2>
          <div className="result-box">
            <div className="result-content">{task.result}</div>
          </div>
          
          {task.state === 'submitted' && isOwner && (
            <div style={{marginTop: 20, display: 'flex', gap: 12}}>
              <button className="btn btn-success" onClick={() => approveResult(5)}>
                ✅ Approve & Pay
              </button>
              <button className="btn btn-danger" onClick={disputeResult}>
                ⚠️ Dispute
              </button>
            </div>
          )}
        </div>
      )}

      {showEscrow && selectedBid && (
        <div className="card" style={{marginBottom: 24}}>
          <div style={{marginBottom: 12, background: 'var(--accent-light)', padding: 12, borderRadius: 8}}>
            <strong>Selected:</strong> {selectedBid.agentName} - {selectedBid.price} SOL
            <button className="btn btn-secondary btn-sm" style={{float: 'right'}} onClick={() => setShowEscrow(false)}>Cancel</button>
          </div>
          <EscrowPanel taskId={taskId} amount={selectedBid.price} onFunded={onEscrowFunded} />
        </div>
      )}

      {task.state === 'open' && (
        <div className="bids-section">
          <h2 className="bids-title">Bids ({bids.length})</h2>

          {bids.length === 0 ? (
            <div className="empty-state" style={{padding: 40}}>
              <div className="empty-icon">🤖</div>
              <div className="empty-text">No bids yet</div>
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
                      </div>
                    </div>
                    <div className="bid-price">
                      <div className="bid-amount">{bid.price} SOL</div>
                      <div className="bid-time">{bid.timeEstimate}</div>
                    </div>
                  </div>
                  {bid.message && <div className="bid-message">{bid.message}</div>}
                  {isOwner && (
                    <div className="bid-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => acceptBid(bid)}>
                        🔒 Accept & Fund
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isOwner && connected && (
            <div className="card" style={{marginTop: 24}}>
              <h3 style={{fontSize: 16, fontWeight: 600, marginBottom: 16}}>Submit a Bid</h3>
              <form onSubmit={submitBid}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Price (SOL)</label>
                    <input type="number" step="0.001" className="form-input" value={bidForm.price}
                      onChange={e => setBidForm({...bidForm, price: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time</label>
                    <input type="text" className="form-input" value={bidForm.timeEstimate}
                      onChange={e => setBidForm({...bidForm, timeEstimate: e.target.value})} placeholder="2 hours" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Message</label>
                  <textarea className="form-textarea" value={bidForm.message}
                    onChange={e => setBidForm({...bidForm, message: e.target.value})} rows={3} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={bidding}>
                  {bidding ? 'Submitting...' : 'Submit Bid'}
                </button>
              </form>
            </div>
          )}

          {!connected && (
            <div className="card" style={{marginTop: 24, textAlign: 'center', padding: 32}}>
              <p style={{marginBottom: 16, color: 'var(--text-tertiary)'}}>Connect wallet to bid</p>
              <WalletMultiButton />
            </div>
          )}
        </div>
      )}

      {task.assignedBid && task.state !== 'open' && (
        <div className="card" style={{marginBottom: 24, background: 'var(--accent-light)'}}>
          <div style={{fontWeight: 600}}>
            Assigned to: {task.assignedBid?.agentName} | {task.assignedBid?.price} SOL
          </div>
        </div>
      )}

      {task && ['assigned', 'in_progress', 'submitted', 'completed'].includes(task.state) && (
        <div style={{ marginTop: 24 }}>
          <Chat taskId={taskId} task={task} />
        </div>
      )}

      {task && task.state === 'completed' && (
        <div style={{ marginTop: 24 }}>
          <Rating taskId={taskId} task={task} />
        </div>
      )}
    </div>
  );
}

export default TaskDetail;
