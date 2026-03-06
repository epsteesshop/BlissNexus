import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Link } from 'react-router-dom';
import escrow from '../lib/escrow';

const API = 'https://api.blissnexus.ai';
const ADMIN_WALLET = '8M6uxJCeGc7oJ8nVkCt4RpX1URVejnTRFRmKGs5815Kb';

function Disputes() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const wallet = publicKey?.toBase58();
  const isAdmin = wallet === ADMIN_WALLET;

  useEffect(() => {
    if (isAdmin) fetchDisputes();
  }, [isAdmin]);

  const fetchDisputes = async () => {
    try {
      const res = await fetch(`${API}/api/v2/disputes`);
      const data = await res.json();
      setDisputes(data.disputes || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const resolveDispute = async (task, decision) => {
    // decision: 'refund' or 'release'
    setProcessing(task.id);
    setError('');
    setSuccess('');

    try {
      const agentWallet = task.assignedBid?.wallet || task.disputeInfo?.agentWallet || task.assignedAgent;
      const requesterWallet = task.requester || task.disputeInfo?.requester;
      
      if (!agentWallet) throw new Error('No agent wallet found');
      if (!requesterWallet) throw new Error('No requester wallet found');

      // Build resolve_dispute transaction (admin signs)
      const { transaction } = await escrow.buildResolveDisputeTransaction(
        wallet,           // admin
        task.id,
        agentWallet,
        requesterWallet,
        decision === 'release',  // releaseToWorker
        connection
      );

      const signature = await sendTransaction(transaction, connection);
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latestBlockhash });

      // Update backend - mark task as completed or cancelled
      const newState = decision === 'release' ? 'completed' : 'cancelled';
      await fetch(`${API}/api/v2/disputes/${task.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reasoning: `Admin resolved: ${decision}`,
          arbitratorId: wallet,
          txSignature: signature,
          executed: true,
          newState
        }),
      });

      setSuccess(`✅ ${decision === 'release' ? 'Released to agent' : 'Refunded to requester'} - TX: ${signature.slice(0, 16)}...`);
      fetchDisputes();
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(null);
    }
  };

  if (!wallet) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔐</div>
        <div className="empty-title">Connect Wallet</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⛔</div>
        <div className="empty-title">Access Denied</div>
        <div className="empty-text">Admin only</div>
      </div>
    );
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div> Loading disputes...</div>;
  }

  return (
    <div style={{maxWidth: 900, margin: '0 auto'}}>
      <h1 style={{fontSize: 24, marginBottom: 24}}>⚖️ Dispute Resolution</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {disputes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div className="empty-title">No Active Disputes</div>
          <div className="empty-text">All clear!</div>
        </div>
      ) : (
        <div className="disputes-list">
          {disputes.map(task => (
            <div key={task.id} className="card" style={{marginBottom: 24}}>
              <div className="card-header">
                <div>
                  <h3 style={{margin: 0}}>{task.title}</h3>
                  <Link to={`/app/task/${task.id}`} style={{fontSize: 12, color: 'var(--accent)'}}>
                    View Task →
                  </Link>
                </div>
                <span className="badge badge-disputed">Disputed</span>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16}}>
                <div style={{padding: 12, background: 'var(--bg-secondary)', borderRadius: 8}}>
                  <div style={{fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4}}>Requester</div>
                  <div style={{fontFamily: 'monospace', fontSize: 12}}>{task.requester?.slice(0, 12)}...</div>
                </div>
                <div style={{padding: 12, background: 'var(--bg-secondary)', borderRadius: 8}}>
                  <div style={{fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4}}>Agent</div>
                  <div style={{fontFamily: 'monospace', fontSize: 12}}>{task.disputeInfo?.agent?.slice(0, 12)}...</div>
                </div>
              </div>

              <div style={{padding: 12, background: '#fee', borderRadius: 8, marginBottom: 16}}>
                <div style={{fontSize: 12, color: '#c00', marginBottom: 4}}>⚠️ Dispute Reason</div>
                <div>{task.disputeReason || task.disputeInfo?.disputeReason || 'No reason provided'}</div>
              </div>

              {task.result && (
                <div style={{padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 16}}>
                  <div style={{fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4}}>📝 Submitted Result</div>
                  <div style={{fontSize: 14}}>{task.result}</div>
                </div>
              )}

              {task.resultAttachments?.length > 0 && (
                <div style={{marginBottom: 16}}>
                  <div style={{fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8}}>📎 Deliverables</div>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                    {task.resultAttachments.map((file, i) => (
                      <a 
                        key={i}
                        href={file.url || `${API}/api/v2/attachments/${file.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        📄 {file.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {task.chatHistory?.length > 0 && (
                <div style={{marginBottom: 16}}>
                  <div style={{fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8}}>💬 Chat History ({task.chatHistory.length} messages)</div>
                  <div style={{maxHeight: 200, overflow: 'auto', background: 'var(--bg-secondary)', borderRadius: 8, padding: 12}}>
                    {task.chatHistory.map((msg, i) => (
                      <div key={i} style={{marginBottom: 8, fontSize: 13}}>
                        <strong>{msg.sender_name}:</strong> {msg.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{padding: 12, background: 'var(--accent-light)', borderRadius: 8, marginBottom: 16}}>
                <div style={{fontSize: 14, fontWeight: 600}}>💰 Amount: {task.disputeInfo?.amount || task.assignedBid?.price || task.maxBudget} SOL</div>
              </div>

              <div style={{display: 'flex', gap: 12}}>
                <button 
                  className="btn btn-success"
                  onClick={() => resolveDispute(task, 'release')}
                  disabled={processing === task.id}
                  style={{flex: 1}}
                >
                  {processing === task.id ? '⏳...' : '✅ Release to Agent'}
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => resolveDispute(task, 'refund')}
                  disabled={processing === task.id}
                  style={{flex: 1}}
                >
                  {processing === task.id ? '⏳...' : '↩️ Refund to Requester'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Disputes;
