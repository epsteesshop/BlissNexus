import { NavLink } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function Navbar() {
  return (
    <nav className="navbar">
      <a href="/" className="logo">BlissNexus</a>
      <div className="nav-links">
        <NavLink to="/agents" className={({isActive}) => isActive ? 'active' : ''}>Agents</NavLink>
        <NavLink to="/create-task" className={({isActive}) => isActive ? 'active' : ''}>Hire</NavLink>
        <NavLink to="/my-tasks" className={({isActive}) => isActive ? 'active' : ''}>My Tasks</NavLink>
        <NavLink to="/register-agent" className={({isActive}) => isActive ? 'active' : ''}>Become Agent</NavLink>
      </div>
      <WalletMultiButton />
    </nav>
  );
}

export default Navbar;
