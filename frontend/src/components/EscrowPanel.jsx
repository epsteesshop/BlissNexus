import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import escrow from '../lib/escrow';

const API = 'https://api.blissnexus.ai';

function EscrowPanel({ taskId, amount, workerWallet: workerWalletProp, onFunded }) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  
  const [balance, setBalance] = useState(null); // null = not yet loaded
  const [escrowStatus, setEscrowStatus] = useState(null);
  const [escrowData, setEscrowData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const [workerWallet, setWorkerWallet] = useState(workerWalletProp);

  const wallet = publicKey?.toBase58();

  // Fetch worker wallet from task if not provided as prop
  useEffect(() => {
    async function fetchWorkerWallet() {
      if (workerWalletProp) {
        setWorkerWallet(workerWalletProp);
        return;
      }
      
      try {
        const res = await fetch(`${API}/api/v2/tasks/${taskId}`);
        const task = await res.json();
        
        // Try multiple sources for worker wallet
        const acceptedBid = task.bids?.find(b => b.status === 'accepted');
        const worker = acceptedBid?.wallet || task.assignedBid?.wallet || task.assignedAgent;
        
        if (worker) {
          console.log('[EscrowPanel] Fetched worker wallet from task:', worker);
          setWorkerWallet(worker);
        } else {
          console.error('[EscrowPanel] Could not find worker wallet in task:', task);
          setError('Could not determine agent wallet. Please refresh.');
        }
      } catch (e) {
        console.error('[EscrowPanel] Failed to fetch task:', e);
      }
    }
    
    fetchWorkerWallet();
  }, [taskId, workerWalletProp]);

  useEffect(() => {
    if (wallet && taskId) {
      loadData();
    }
  }, [wallet, taskId]);

  const loadData = async () => {
    // Try multiple RPCs for balance (public mainnet RPC rate-limits often)
    const RPCS = [
      'https://rpc.ankr.com/solana',
      'https://api.mainnet-beta.solana.com',
      'https://solana-rpc.publicnode.com',
    ];
    let balanceFetched = false;
    for (const rpc of RPCS) {
      try {
        const { PublicKey, LAMPORTS_PER_SOL, Connection } = await import('@solana/web3.js');
        const conn = new Connection(rpc, 'confirmed');
        const lamports = await conn.getBalance(new PublicKey(wallet));
        setBalance(lamports / LAMPORTS_PER_SOL);
        balanceFetched = true;
        break;
      } catch (e) {
        console.warn('[EscrowPanel] RPC failed, trying next:', rpc, e.message);
      }
    }
    if (!balanceFetched) {
      console.warn('[EscrowPanel] All RPCs failed for balance — proceeding without balance display');
      setBalance(-1); // sentinel: unknown
    }
    
    try {
      const [status, data] = await Promise.all([
        escrow.checkEscrowFunding(taskId),
        escrow.getEscrowData(taskId),
      ]);
      setEscrowStatus(status);
      setEscrowData(data);
    } catch (e) {
      console.warn('[EscrowPanel] Escrow check failed:', e.message);
    }
  };

  const fundEscrow = async () => {
    if (!publicKey) return setError('Connect wallet first');
    
    // Validate worker wallet
    if (!workerWallet) {
      setError('Worker wallet not available. Please refresh the page.');
      console.error('[EscrowPanel] workerWallet is undefined');
      return;
    }
    
    // Validate it's a proper Solana address
    try {
      const { PublicKey } = await import('@solana/web3.js');
      new PublicKey(workerWallet);
    } catch (e) {
      setError('Invalid worker wallet address: ' + workerWallet);
      console.error('[EscrowPanel] Invalid workerWallet:', workerWallet, e);
      return;
    }
    
    setLoading(true);
    setError('');
    
    console.log('[EscrowPanel] Funding escrow with:', {
      requester: wallet,
      taskId,
      amount,
      workerWallet
    });
    
    try {
      const { transaction, escrowPDA } = await escrow.buildCreateEscrowTransaction(
        wallet,
        taskId,
        amount,
        workerWallet,
        connection  // Use wallet adapter connection (avoids 403 on custom RPCs)
      );
      
      console.log('[EscrowPanel] Transaction built, escrowPDA:', escrowPDA);
      
      const signature = await sendTransaction(transaction, connection);
      setTxSignature(signature);
      console.log('[EscrowPanel] Transaction sent:', signature);
      
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash,
      });
      
      console.log('[EscrowPanel] Transaction confirmed');
      
      // Verify escrow was created correctly
      const verification = await escrow.verifyEscrow(taskId, workerWallet);
      if (!verification.valid) {
        console.error('[EscrowPanel] Escrow verification failed:', verification);
        setError('Escrow created but worker address is wrong: ' + verification.error);
        return;
      }
      console.log('[EscrowPanel] Escrow verified, worker:', verification.worker);
      
      await loadData();
      if (onFunded) onFunded(signature, escrowPDA);
    } catch (e) {
      console.error('[EscrowPanel] Fund failed:', e);
      setError(e.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div style={{padding: 20, textAlign: 'center', color: 'var(--text-secondary)'}}>
        Connect wallet to fund escrow
      </div>
    );
  }

  return (
    <div style={{padding: 16}}>
      <h3 style={{margin: '0 0 16px 0', fontSize: 18}}>🔐 Fund Escrow</h3>
      
      {error && <div style={{padding: 12, background: '#fee', color: '#c00', borderRadius: 8, marginBottom: 12}}>{error}</div>}
      
      <div style={{marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8}}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
          <span>Your Balance:</span>
          <strong>{balance === null ? '...' : balance === -1 ? 'Unknown' : balance.toFixed(4) + ' SOL'}</strong>
        </div>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
          <span>Amount to Lock:</span>
          <strong>{amount} SOL</strong>
        </div>
        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)'}}>
          <span>Agent:</span>
          <span>{workerWallet ? `${workerWallet.slice(0, 8)}...${workerWallet.slice(-4)}` : 'Loading...'}</span>
        </div>
      </div>
      
      
      
      <button 
        className="btn btn-primary" 
        onClick={fundEscrow}
        disabled={loading || !workerWallet}
        style={{width: '100%'}}
      >
        {loading ? '⏳ Processing...' : `🔐 Lock ${amount} SOL in Escrow`}
      </button>
      
      {txSignature && (
        <div style={{marginTop: 12, fontSize: 12, wordBreak: 'break-all'}}>
          ✅ TX: <a href={`https://explorer.solana.com/tx/${txSignature}`} target="_blank" rel="noopener noreferrer">{txSignature}</a>
        </div>
      )}
      
      <div style={{marginTop: 16, fontSize: 12, color: 'var(--text-secondary)'}}>
        Funds are locked in escrow until you approve the deliverable. You can dispute within 24h if unsatisfied.
      </div>
    </div>
  );
}

export default EscrowPanel;
