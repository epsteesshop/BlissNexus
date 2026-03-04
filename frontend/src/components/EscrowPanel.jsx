import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import escrow from '../lib/escrow';

function EscrowPanel({ taskId, amount, workerWallet, state, onFunded }) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  
  const [balance, setBalance] = useState(0);
  const [escrowStatus, setEscrowStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txSignature, setTxSignature] = useState('');

  const wallet = publicKey?.toBase58();

  useEffect(() => {
    if (wallet) {
      loadData();
    }
  }, [wallet, taskId]);

  const loadData = async () => {
    const [bal, status] = await Promise.all([
      escrow.getBalance(wallet),
      escrow.checkEscrowFunding(taskId),
    ]);
    setBalance(bal);
    setEscrowStatus(status);
  };

  const requestAirdrop = async () => {
    setLoading(true);
    setError('');
    const result = await escrow.requestAirdrop(wallet, 2);
    if (result.success) {
      setError('');
      await loadData();
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  const fundEscrow = async () => {
    if (!publicKey) return setError('Connect wallet first');
    if (balance < amount) return setError('Insufficient balance');
    
    setLoading(true);
    setError('');
    
    try {
      const { transaction, escrowPDA } = await escrow.buildFundEscrowTransaction(
        wallet,
        taskId,
        amount
      );
      
      const signature = await sendTransaction(transaction, connection);
      setTxSignature(signature);
      
      // Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash,
      });
      
      await loadData();
      if (onFunded) onFunded(signature, escrowPDA);
    } catch (e) {
      setError(e.message);
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

      {escrowStatus?.funded ? (
        <div style={{background: 'var(--success-light)', color: 'var(--success)', padding: 16, borderRadius: 8, marginBottom: 16}}>
          <div style={{fontWeight: 600, marginBottom: 4}}>✅ Escrow Funded</div>
          <div style={{fontSize: 13}}>
            {escrowStatus.balance} SOL locked at {escrowStatus.escrowPDA?.slice(0, 8)}...
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
        <strong>How it works:</strong> Funds are locked on-chain until you approve the result. 
        If approved, payment goes to the agent. If disputed, funds can be refunded.
      </div>
    </div>
  );
}

export default EscrowPanel;
