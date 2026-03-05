import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import escrow from '../lib/escrow';

function EscrowPanel({ taskId, amount, state, onFunded }) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  
  const [balance, setBalance] = useState(0);
  const [escrowStatus, setEscrowStatus] = useState(null);
  const [escrowData, setEscrowData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txSignature, setTxSignature] = useState('');

  const wallet = publicKey?.toBase58();

  useEffect(() => {
    if (wallet && taskId) {
      loadData();
    }
  }, [wallet, taskId]);

  const loadData = async () => {
    const [bal, status, data] = await Promise.all([
      escrow.getBalance(wallet),
      escrow.checkEscrowFunding(taskId),
      escrow.getEscrowData(taskId),
    ]);
    setBalance(bal);
    setEscrowStatus(status);
    setEscrowData(data);
  };

  const requestAirdrop = async () => {
    setLoading(true);
    setError('');
    const result = await escrow.requestAirdrop(wallet, 1);
    if (result.success) {
      await loadData();
    } else {
      setError(result.error || 'Airdrop failed');
    }
    setLoading(false);
  };

  const fundEscrow = async () => {
    if (!publicKey) return setError('Connect wallet first');
    if (balance < amount) return setError('Insufficient balance');
    
    setLoading(true);
    setError('');
    
    try {
      // Build createEscrow transaction (proper Anchor instruction)
      const { transaction, escrowPDA } = await escrow.buildCreateEscrowTransaction(
        wallet,
        taskId,
        amount
      );
      
      // Send and confirm
      const signature = await sendTransaction(transaction, connection);
      setTxSignature(signature);
      
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash,
      });
      
      await loadData();
      if (onFunded) onFunded(signature, escrowPDA);
    } catch (e) {
      console.error('[Escrow] Fund failed:', e);
      setError(e.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div className="card" style={{background: 'var(--bg-tertiary)'}}>
        <div style={{textAlign: 'center', padding: 20}}>
          <p style={{color: 'var(--text-tertiary)'}}>Connect wallet to fund escrow</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8}}>
        🔒 Escrow
        <span style={{fontSize: 12, padding: '2px 8px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 100}}>
          Devnet
        </span>
        {escrowData && (
          <span style={{
            fontSize: 11, 
            padding: '2px 8px', 
            background: escrowData.state === 'Funded' ? '#dcfce7' : 
                       escrowData.state === 'Disputed' ? '#fef3c7' :
                       escrowData.state === 'Released' ? '#dbeafe' : '#f3f4f6',
            color: escrowData.state === 'Funded' ? '#166534' :
                   escrowData.state === 'Disputed' ? '#92400e' :
                   escrowData.state === 'Released' ? '#1e40af' : '#374151',
            borderRadius: 100,
            marginLeft: 'auto'
          }}>
            {escrowData.state}
          </span>
        )}
      </h3>

      {error && <div className="alert alert-error" style={{marginBottom: 16}}>{error}</div>}

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16}}>
        <div>
          <div style={{fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4}}>Your Balance</div>
          <div style={{fontSize: 18, fontWeight: 600}}>{balance.toFixed(4)} SOL</div>
        </div>
        <div>
          <div style={{fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4}}>Required</div>
          <div style={{fontSize: 18, fontWeight: 600, color: 'var(--success)'}}>{amount} SOL</div>
        </div>
      </div>

      {escrowStatus?.funded && escrowStatus?.isProgramOwned ? (
        <div style={{background: 'var(--success-light)', color: 'var(--success)', padding: 16, borderRadius: 8, marginBottom: 16}}>
          <div style={{fontWeight: 600, marginBottom: 4}}>✅ Escrow Funded (Program-Owned)</div>
          <div style={{fontSize: 13}}>
            {escrowStatus.balance.toFixed(4)} SOL locked at{' '}
            <a 
              href={`https://explorer.solana.com/address/${escrowStatus.escrowPDA}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{color: 'inherit', textDecoration: 'underline'}}
            >
              {escrowStatus.escrowPDA?.slice(0, 12)}...
            </a>
          </div>
          {escrowData && (
            <div style={{fontSize: 12, marginTop: 8, opacity: 0.8}}>
              State: {escrowData.state} | Amount: {escrowData.amount} SOL
            </div>
          )}
        </div>
      ) : escrowStatus?.funded && !escrowStatus?.isProgramOwned ? (
        <div style={{background: '#fef3c7', color: '#92400e', padding: 16, borderRadius: 8, marginBottom: 16}}>
          <div style={{fontWeight: 600, marginBottom: 4}}>⚠️ Legacy Escrow (Not Refundable)</div>
          <div style={{fontSize: 13}}>
            {escrowStatus.balance.toFixed(4)} SOL stuck at {escrowStatus.escrowPDA?.slice(0, 12)}...
          </div>
        </div>
      ) : (
        <>
          {balance < amount && (
            <button 
              className="btn btn-secondary" 
              onClick={requestAirdrop} 
              disabled={loading}
              style={{width: '100%', marginBottom: 8}}
            >
              {loading ? 'Requesting...' : '🚰 Get Devnet SOL (Airdrop)'}
            </button>
          )}
          
          <button 
            className="btn btn-primary" 
            onClick={fundEscrow} 
            disabled={loading || balance < amount}
            style={{width: '100%'}}
          >
            {loading ? 'Processing...' : `🔒 Lock ${amount} SOL in Escrow`}
          </button>
        </>
      )}

      {txSignature && (
        <div style={{marginTop: 12, fontSize: 12}}>
          <span style={{color: 'var(--text-tertiary)'}}>TX: </span>
          <a 
            href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            style={{color: 'var(--accent)'}}
          >
            {txSignature.slice(0, 16)}...
          </a>
        </div>
      )}

      <div style={{marginTop: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: 13, color: 'var(--text-tertiary)'}}>
        <strong>How it works:</strong> Funds are locked on-chain in a program-owned escrow. 
        When you approve the result, payment releases to the agent. 
        If disputed, an arbitrator decides the outcome.
      </div>
    </div>
  );
}

export default EscrowPanel;
