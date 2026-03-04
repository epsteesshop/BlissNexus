import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

function Navbar() {
  const { publicKey, disconnect, wallet, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleConnect = () => {
    setVisible(true);
  };

  const handleDisconnect = async () => {
    await disconnect();
    setShowDropdown(false);
  };

  const handleChangeWallet = async () => {
    await disconnect();
    setShowDropdown(false);
    // Small delay then show modal
    setTimeout(() => setVisible(true), 100);
  };

  const truncateAddress = (addr) => {
    if (!addr) return '';
    return addr.slice(0, 4) + '...' + addr.slice(-4);
  };

  return (
    <nav className="navbar">
      <div className="nav-left">
        <NavLink to="/" className="logo">BlissNexus</NavLink>
        <div className="nav-links">
          <NavLink to="/tasks" className={({isActive}) => isActive ? 'active' : ''}>
            Browse Tasks
          </NavLink>
          {connected && (
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
        {connected && publicKey ? (
          <div className="wallet-connected" style={{position: 'relative'}}>
            <button 
              className="wallet-button"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              {wallet?.adapter?.icon && (
                <img 
                  src={wallet.adapter.icon} 
                  alt={wallet.adapter.name} 
                  className="wallet-icon"
                />
              )}
              <span className="wallet-address">
                {truncateAddress(publicKey.toBase58())}
              </span>
              <span className="wallet-arrow">▼</span>
            </button>
            
            {showDropdown && (
              <>
                <div 
                  className="wallet-dropdown-overlay"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="wallet-dropdown">
                  <div className="wallet-dropdown-header">
                    <span className="wallet-dropdown-name">{wallet?.adapter?.name}</span>
                    <span className="wallet-dropdown-network">Devnet</span>
                  </div>
                  <div className="wallet-dropdown-address">
                    {publicKey.toBase58()}
                  </div>
                  <div className="wallet-dropdown-actions">
                    <button onClick={handleChangeWallet} className="wallet-dropdown-btn">
                      🔄 Change Wallet
                    </button>
                    <button onClick={handleDisconnect} className="wallet-dropdown-btn disconnect">
                      ⏏️ Disconnect
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={handleConnect}>
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
