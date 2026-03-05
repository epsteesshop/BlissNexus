import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import escrow from '../lib/escrow';

const API = 'https://api.blissnexus.ai';

export default function Release() {
  const { taskId } = useParams();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  
  const [task, setTask] = useState(null);
  const [escrowStatus, setEscrowStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [message, setMessage] = useState('');

  const wallet = publicKey?.toBase58();

  useEffect(() => {
    if (taskId) loadTask();
  }, [taskId]);

  const loadTask = async () => {
    try {
      const res = await fetch(`${API}/api/v2/tasks/${taskId}`);
      const data = await res.json();
      setTask(data);
      
      const status = await escrow.checkEscrowFunding(taskId);
      setEscrowStatus(status);
    } catch (e) {
      setMessage('Error: ' + e.message);
    }
    setLoading(false);
  };

  const release = async () => {
    if (!task?.assignedBid?.wallet) return setMessage('No agent wallet');
    
    setReleasing(true);
    setMessage('');
    
    try {
      const { transaction } = await escrow.buildReleaseTransaction(
        wallet, taskId, task.assignedBid.wallet
      );
      
      const sig = await sendTransaction(transaction, connection);
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh });
      
      setMessage(`✅ Released! TX: ${sig.slice(0, 20)}...`);
      setEscrowStatus(null);
    } catch (e) {
      setMessage('❌ ' + e.message);
    }
    setReleasing(false);
  };

  if (loading) return <div className="loading"><div className="spinner"></div> Loading...</div>;
  if (!task) return <div className="card">Task not found</div>;

  return (
    <div style={{maxWidth: 600, margin: '40px auto'}}>
      <div className="card">
        <h2 style={{marginBottom: 20}}>💸 Release Escrow</h2>
        
        <p><strong>Task:</strong> {task.title}</p>
        <p><strong>Agent:</strong> {task.assignedBid?.agentName}</p>
        <p><strong>Amount:</strong> {task.assignedBid?.price} SOL</p>
        
        {escrowStatus?.funded ? (
          <>
            <p style={{marginTop: 20, padding: 12, background: '#fef3c7', borderRadius: 8}}>
              Escrow has <strong>{escrowStatus.balance.toFixed(4)} SOL</strong> locked
            </p>
            <button 
              className="btn btn-primary" 
              onClick={release} 
              disabled={releasing || !wallet}
              style={{marginTop: 16, width: '100%'}}
            >
              {releasing ? 'Releasing...' : `Release to ${task.assignedBid?.agentName}`}
            </button>
          </>
        ) : (
          <p style={{marginTop: 20, padding: 12, background: '#dcfce7', borderRadius: 8, color: '#166534'}}>
            ✅ No funds locked (already released or never funded)
          </p>
        )}
        
        {message && <p style={{marginTop: 16}}>{message}</p>}
      </div>
    </div>
  );
}
