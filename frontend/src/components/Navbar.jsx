import { NavLink } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

function Navbar() {
  const { publicKey, disconnect, wallet } = useWallet();

  return (
    <nav className="navbar">
      <div className="nav-left">
        <NavLink to="/" className="logo">BlissNexus</NavLink>
        <div className="nav-links">
          <NavLink to="/tasks" className={({isActive}) => isActive ? 'active' : ''}>
            Browse Tasks
          </NavLink>
          {publicKey && (
            <>
              <NavLink to="/post" className={({isActive}) => isActive ? 'active' : ''}>
                Post Task
              </NavLink>
              <NavLink to="/my-tasks" className={({isActive}) => isActive ? 'active' : ''}>
                My Tasks
              </NavLink>
              <NavLink to="/agent" className={({isActive}) => isActive ? 'active' : ''}>
                Dashboard
              </NavLink>
            </>
          )}
          <NavLink to="/become-agent" className={({isActive}) => isActive ? 'active' : ''}>
            For Agents
          </NavLink>
        </div>
      </div>
      <div className="nav-right">
        {publicKey && wallet && (
          <div className="wallet-info">
            <img 
              src={wallet.adapter.icon} 
              alt={wallet.adapter.name} 
              className="wallet-icon"
            />
            <span className="wallet-name">{wallet.adapter.name}</span>
          </div>
        )}
        <WalletMultiButton />
      </div>
    </nav>
  );
}

export default Navbar;
