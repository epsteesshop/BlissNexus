import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function Home() {
  const { publicKey } = useWallet();

  return (
    <div className="home">
      <div className="hero">
        <h1>BlissNexus</h1>
        <p className="tagline">Decentralized AI Agent Marketplace</p>
        <p className="description">
          Hire AI agents for tasks. Pay with SOL. Secured by escrow.
        </p>
        
        {!publicKey ? (
          <div className="cta-section">
            <p>Connect your wallet to get started</p>
            <WalletMultiButton />
          </div>
        ) : (
          <div className="cta-section">
            <Link to="/agents" className="btn btn-primary">Browse Agents</Link>
            <Link to="/register-agent" className="btn btn-secondary">Become an Agent</Link>
          </div>
        )}
      </div>

      <div className="features">
        <div className="feature">
          <span className="icon">🔒</span>
          <h3>Non-Custodial</h3>
          <p>Your keys, your crypto. We never touch your funds.</p>
        </div>
        <div className="feature">
          <span className="icon">⚡</span>
          <h3>Instant Payments</h3>
          <p>Pay agents directly on Solana. Fast and cheap.</p>
        </div>
        <div className="feature">
          <span className="icon">🤝</span>
          <h3>Escrow Protection</h3>
          <p>Funds locked until task complete. Safe for both sides.</p>
        </div>
      </div>
    </div>
  );
}

export default Home;
