import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import WalletSelector from './WalletSelector';

function Navbar() {
  const { publicKey, disconnect, wallet, connected, connecting } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleDisconnect = async () => {
    await disconnect();
    setShowDropdown(false);
  };

  const handleChangeWallet = async () => {
    await disconnect();
    setShowDropdown(false);
    setTimeout(() => setShowSelector(true), 100);
  };

  const truncateAddress = (addr) => {
    if (!addr) return '';
    return addr.slice(0, 4) + '...' + addr.slice(-4);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      <nav className="navbar">
        <div className="nav-left">
          <NavLink to="/" className="logo" onClick={closeMobileMenu}>BlissNexus</NavLink>
          
          {/* Desktop nav */}
          <div className="nav-links desktop-only">
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
            <NavLink to="/sdk" className={({isActive}) => isActive ? 'active' : ''} style={{color: 'var(--accent)'}}>
              📖 SDK
            </NavLink>
          </div>
        </div>
        
        <div className="nav-right">
          {/* Mobile hamburger */}
          <button 
            className="mobile-menu-btn mobile-only"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>

          {connected && publicKey ? (
            <div className="wallet-connected">
              <button 
                className="wallet-button"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                {wallet?.adapter?.icon && (
                  <img 
                    src={wallet.adapter.icon} 
                    alt={wallet.adapter.name} 
                    className="wallet-btn-icon"
                  />
                )}
                <span className="wallet-address">
                  {truncateAddress(publicKey.toBase58())}
                </span>
                <svg className="wallet-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              
              {showDropdown && (
                <>
                  <div className="dropdown-overlay" onClick={() => setShowDropdown(false)} />
                  <div className="wallet-dropdown">
                    <div className="dropdown-header">
                      <img src={wallet?.adapter?.icon} alt="" className="dropdown-wallet-icon" />
                      <div>
                        <div className="dropdown-wallet-name">{wallet?.adapter?.name}</div>
                        <div className="dropdown-wallet-addr">{publicKey.toBase58().slice(0,20)}...</div>
                      </div>
                    </div>
                    <div className="dropdown-divider" />
                    <button onClick={handleChangeWallet} className="dropdown-item">
                      <span>↻</span> Change Wallet
                    </button>
                    <button onClick={handleDisconnect} className="dropdown-item danger">
                      <span>⏻</span> Disconnect
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button 
              className="connect-btn"
              onClick={() => setShowSelector(true)}
              disabled={connecting}
            >
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </nav>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="mobile-menu">
          <NavLink to="/tasks" onClick={closeMobileMenu}>Browse Tasks</NavLink>
          {connected && (
            <>
              <NavLink to="/post" onClick={closeMobileMenu}>Post Task</NavLink>
              <NavLink to="/my-tasks" onClick={closeMobileMenu}>My Tasks</NavLink>
              <NavLink to="/agent" onClick={closeMobileMenu}>Dashboard</NavLink>
            </>
          )}
          <NavLink to="/become-agent" onClick={closeMobileMenu}>For Agents</NavLink>
          <NavLink to="/sdk" onClick={closeMobileMenu}>📖 SDK</NavLink>
        </div>
      )}
      
      <WalletSelector isOpen={showSelector} onClose={() => setShowSelector(false)} />
    </>
  );
}

export default Navbar;
