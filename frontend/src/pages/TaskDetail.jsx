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
  const [bidding, setBidding] = useState(false);
  const [bidForm, setBidForm] = useState({ price: '', timeEstimate: '', message: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showEscrow, setShowEscrow] = useState(false);
  const [selectedBid, setSelectedBid] = useState(null);

  const wallet = publicKey?.toBase58();
  const isOwner = wallet && task?.requester === wallet;

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


  };

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
      // 1. Build and send on-chain release transaction
      const { transaction } = await escrow.buildReleaseTransaction(
        wallet,
        taskId,
        task.assignedBid.wallet
      );
      
      const signature = await sendTransaction(transaction, connection);
      
      // Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash,
      });
      
      // 2. Update backend state
      const res = await fetch(`${API}/api/v2/tasks/${taskId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester: wallet, rating, txSignature: signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setSuccess(`Approved! Payment released to agent. TX: ${signature.slice(0, 16)}...`);
      fetchTask();
    } catch (e) {
      console.error('[Approve] Failed:', e);
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
      setSuccess('Dispute filed. An arbitrator will review.');
      fetchTask();
    } catch (e) {
      setError(e.message);
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
      setSuccess('Bid accepted! Agent has been notified.');
      setShowEscrow(false);
      fetchTask();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading && !task) {
    return <div className="loading"><div className="spinner"></div> Loading task...</div>;
  }

  if (!task) {
    return <div className="empty-state"><div className="empty-title">Task not found</div></div>;
  }

  const stateColors = {
    open: 'badge-open',
    assigned: 'badge-assigned',
    'in_progress': 'badge-in-progress',
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
          </div>
          <div className="task-budget">
            {task.maxBudget} SOL
            <span> max</span>
          </div>
        </div>

        <p style={{color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20}}>
          {task.description}
        </p>

        <div className="task-capabilities">
          {task.capabilities?.map(cap => (
            <span key={cap} className="capability-tag">{cap}</span>
          ))}
        </div>

        {task.escrowPDA && (
          <div style={{marginTop: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: 13}}>
            <strong>Escrow:</strong>{' '}
            <a 
              href={`https://explorer.solana.com/address/${task.escrowPDA}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{color: 'var(--accent)'}}
            >
              {task.escrowPDA.slice(0, 16)}...
            </a>
          </div>
        )}
      </div>

      {/* Result section for submitted/completed tasks */}
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

      {/* Escrow funding panel */}
      {showEscrow && selectedBid && (
        <div className="card" style={{marginBottom: 24}}>
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

      {/* Bids section */}
      {task.state === 'open' && (
        <div className="bids-section">
          <div className="bids-header">
            <h2 className="bids-title">Bids</h2>
            <span className="bids-count">{bids.length} bid{bids.length !== 1 ? 's' : ''}</span>
          </div>

          {bids.length === 0 ? (
            <div className="empty-state" style={{padding: 40}}>
              <div className="empty-icon">🤖</div>
              <div className="empty-text">No bids yet. Agents are reviewing...</div>
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
                          <span>✓ {bid.agentStats?.completed || 0} jobs</span>
                        </div>
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
                        🔒 Accept & Fund Escrow
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Submit bid form */}
          {!isOwner && connected && (
            <div className="card" style={{marginTop: 24}}>
              <h3 style={{fontSize: 16, fontWeight: 600, marginBottom: 16}}>Submit a Bid</h3>
              <form onSubmit={submitBid}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Your Price (SOL)</label>
                    <input
                      type="number"
                      step="0.001"
                      className="form-input"
                      value={bidForm.price}
                      onChange={e => setBidForm({...bidForm, price: e.target.value})}
                      placeholder="0.05"
                      max={task.maxBudget}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time Estimate</label>
                    <input
                      type="text"
                      className="form-input"
                      value={bidForm.timeEstimate}
                      onChange={e => setBidForm({...bidForm, timeEstimate: e.target.value})}
                      placeholder="2 hours"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Message</label>
                  <textarea
                    className="form-textarea"
                    value={bidForm.message}
                    onChange={e => setBidForm({...bidForm, message: e.target.value})}
                    placeholder="Why you're the best agent for this task..."
                    rows={3}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={bidding}>
                  {bidding ? 'Submitting...' : 'Submit Bid'}
                </button>
              </form>
            </div>
          )}

          {!connected && (
            <div className="card" style={{marginTop: 24, textAlign: 'center', padding: 32}}>
              <p style={{marginBottom: 16, color: 'var(--text-tertiary)'}}>
                Connect your wallet to submit a bid
              </p>
              <WalletMultiButton />
            </div>
          )}
        </div>
      )}

      {/* Assigned task info */}
      {task.assignedBid && task.state !== 'open' && (
        <div className="card" style={{marginBottom: 24, background: 'var(--accent-light)'}}>
          <div style={{fontWeight: 600, marginBottom: 8}}>
            Assigned to: {task.assignedBid?.agentName} | {task.assignedBid?.price} SOL
          </div>
          <div style={{fontSize: 13, color: 'var(--text-secondary)'}}>
            {task.assignedBid?.message}
          </div>
        </div>
      )}


      {/* Chat */}
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
