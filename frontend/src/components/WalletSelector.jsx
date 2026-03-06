import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useState } from 'react';

function WalletSelector({ isOpen, onClose }) {
  const { wallets, select, connect, connecting, connected, wallet } = useWallet();
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [error, setError] = useState('');

  // When wallet is selected and ready, connect
  useEffect(() => {
    if (selectedWallet && wallet?.adapter?.name === selectedWallet) {
      connect().catch((err) => {
        console.error('Connection failed:', err);
        setError(err.message || 'Connection failed');
        setSelectedWallet(null);
      });
    }
  }, [wallet, selectedWallet, connect]);

  // Close when connected
  useEffect(() => {
    if (connected && isOpen) {
      onClose();
      setSelectedWallet(null);
      setError('');
    }
  }, [connected, isOpen, onClose]);

  const handleSelect = useCallback((walletName) => {
    setError('');
    setSelectedWallet(walletName);
    select(walletName);
  }, [select]);

  const handleClose = () => {
    setSelectedWallet(null);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  // Filter to installed/loadable wallets
  const availableWallets = wallets.filter(
    w => w.readyState === 'Installed' || w.readyState === 'Loadable'
  );

  return (
    <>
      <div className="wallet-selector-backdrop" onClick={handleClose} />
      
      <div className="wallet-selector-panel">
        <div className="wallet-selector-header">
          <h3>Connect Wallet</h3>
          <button className="wallet-selector-close" onClick={handleClose}>×</button>
        </div>
        
        <p className="wallet-selector-subtitle">
          Select a wallet to connect to BlissNexus
        </p>

        {error && (
          <div className="wallet-selector-error">
            {error}
          </div>
        )}
        
        <div className="wallet-selector-list">
          {availableWallets.length > 0 ? (
            availableWallets.map((w) => (
              <button
                key={w.adapter.name}
                className={`wallet-selector-option ${selectedWallet === w.adapter.name ? 'connecting' : ''}`}
                onClick={() => handleSelect(w.adapter.name)}
                disabled={connecting}
              >
                <img 
                  src={w.adapter.icon} 
                  alt={w.adapter.name}
                  className="wallet-selector-icon"
                />
                <span className="wallet-selector-name">{w.adapter.name}</span>
                {selectedWallet === w.adapter.name && connecting ? (
                  <span className="wallet-selector-status">Connecting...</span>
                ) : w.readyState === 'Installed' ? (
                  <span className="wallet-selector-badge">Detected</span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="wallet-selector-empty">
              <p>No wallets detected</p>
              <div className="wallet-selector-links">
                <a href="https://phantom.app" target="_blank" rel="noopener noreferrer">
                  Get Phantom →
                </a>
                <a href="https://solflare.com" target="_blank" rel="noopener noreferrer">
                  Get Solflare →
                </a>
              </div>
            </div>
          )}
        </div>
        
        <div className="wallet-selector-footer">
          🔒 Non-custodial • Mainnet
        </div>
      </div>
    </>
  );
}

export default WalletSelector;
