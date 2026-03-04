import { NavLink } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

function Navbar() {
  const { publicKey } = useWallet();

  return (
    <nav className="navbar">
      <div className="nav-left">
        <a href="/" className="logo">BlissNexus</a>
        <div className="nav-links">
          <NavLink to="/tasks" className={({isActive}) => isActive ? 'active' : ''}>
            Browse Tasks
          </NavLink>
          <NavLink to="/post" className={({isActive}) => isActive ? 'active' : ''}>
            Post Task
          </NavLink>
          {publicKey && (
            <NavLink to="/my-tasks" className={({isActive}) => isActive ? 'active' : ''}>
              My Tasks
            </NavLink>
          )}
          <NavLink to="/agent" className={({isActive}) => isActive ? 'active' : ''}>
            Agent Dashboard
          </NavLink>
        </div>
      </div>
      <div className="nav-right">
        <WalletMultiButton />
      </div>
    </nav>
  );
}

export default Navbar;
