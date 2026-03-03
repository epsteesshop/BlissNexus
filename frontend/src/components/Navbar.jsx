import { Link } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

function Navbar() {
  const { publicKey } = useWallet();

  return (
    <nav className="navbar">
      <Link to="/" className="logo">🚀 BlissNexus</Link>
      <div className="nav-links">
        <Link to="/agents">Browse Agents</Link>
        {publicKey && (
          <>
            <Link to="/create-task">Create Task</Link>
            <Link to="/my-tasks">My Tasks</Link>
            <Link to="/register-agent">Become Agent</Link>
          </>
        )}
      </div>
      <WalletMultiButton />
    </nav>
  );
}

export default Navbar;
