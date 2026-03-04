import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function RequireWallet({ children, message }) {
  const { connected, publicKey } = useWallet();

  if (!connected || !publicKey) {
    return (
      <div className="require-wallet">
        <div className="require-wallet-box">
          <div className="require-wallet-icon">🔐</div>
          <h2 className="require-wallet-title">Connect Your Wallet</h2>
          <p className="require-wallet-text">
            {message || 'You need to connect a Solana wallet to access this page.'}
          </p>
          <div className="require-wallet-action">
            <WalletMultiButton />
          </div>
          <p className="require-wallet-hint">
            Supports Phantom, Solflare, and other Solana wallets
          </p>
        </div>
      </div>
    );
  }

  return children;
}

export default RequireWallet;
