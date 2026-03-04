import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback } from 'react';

function WalletSelector({ isOpen, onClose }) {
  const { wallets, select, connecting } = useWallet();

  const handleSelect = useCallback(async (walletName) => {
    select(walletName);
    onClose();
  }, [select, onClose]);

  if (!isOpen) return null;

  // Filter to installed/loadable wallets
  const availableWallets = wallets.filter(
    w => w.readyState === 'Installed' || w.readyState === 'Loadable'
  );

  return (
    <>
      {/* Backdrop */}
      <div className="wallet-selector-backdrop" onClick={onClose} />
      
      {/* Panel */}
      <div className="wallet-selector-panel">
        <div className="wallet-selector-header">
          <h3>Connect Wallet</h3>
          <button className="wallet-selector-close" onClick={onClose}>×</button>
        </div>
        
        <p className="wallet-selector-subtitle">
          Select a wallet to connect to BlissNexus
        </p>
        
        <div className="wallet-selector-list">
          {availableWallets.length > 0 ? (
            availableWallets.map((wallet) => (
              <button
                key={wallet.adapter.name}
                className="wallet-selector-option"
                onClick={() => handleSelect(wallet.adapter.name)}
                disabled={connecting}
              >
                <img 
                  src={wallet.adapter.icon} 
                  alt={wallet.adapter.name}
                  className="wallet-selector-icon"
                />
                <span className="wallet-selector-name">{wallet.adapter.name}</span>
                {wallet.readyState === 'Installed' && (
                  <span className="wallet-selector-badge">Detected</span>
                )}
              </button>
            ))
          ) : (
            <div className="wallet-selector-empty">
              <p>No wallets detected</p>
              <a href="https://phantom.app" target="_blank" rel="noopener noreferrer">
                Get Phantom
              </a>
              <a href="https://solflare.com" target="_blank" rel="noopener noreferrer">
                Get Solflare
              </a>
            </div>
          )}
        </div>
        
        <div className="wallet-selector-footer">
          <span>🔒 Non-custodial • Devnet</span>
        </div>
      </div>
    </>
  );
}

export default WalletSelector;
