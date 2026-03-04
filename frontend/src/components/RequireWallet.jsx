import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import WalletSelector from './WalletSelector';

function RequireWallet({ children, message }) {
  const { connected } = useWallet();
  const [showSelector, setShowSelector] = useState(false);

  if (!connected) {
    return (
      <>
        <div className="require-wallet">
          <div className="require-wallet-box">
            <div className="require-wallet-icon">🔐</div>
            <h2 className="require-wallet-title">Connect Your Wallet</h2>
            <p className="require-wallet-text">
              {message || 'Connect a Solana wallet to continue.'}
            </p>
            <button 
              className="connect-btn"
              onClick={() => setShowSelector(true)}
              style={{marginTop: 8}}
            >
              Select Wallet
            </button>
            <p className="require-wallet-hint">
              Phantom • Solflare • More
            </p>
          </div>
        </div>
        <WalletSelector isOpen={showSelector} onClose={() => setShowSelector(false)} />
      </>
    );
  }

  return children;
}

export default RequireWallet;
