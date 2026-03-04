import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import './App.css';
import '@solana/wallet-adapter-react-ui/styles.css';

// Pages
import Home from './pages/Home';
import BrowseTasks from './pages/BrowseTasks';
import Agents from './pages/Agents';
import PostTask from './pages/PostTask';
import TaskDetail from './pages/TaskDetail';
import RegisterAgent from './pages/RegisterAgent';
import MyTasks from './pages/MyTasks';

function Navbar() {
  const { connected } = useWallet();
  
  return (
    <nav className="navbar">
      <div className="nav-left">
        <NavLink to="/" className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">BlissNexus</span>
        </NavLink>
        
        <div className="nav-links">
          <NavLink to="/tasks" className={({ isActive }) => isActive ? 'active' : ''}>
            Browse Tasks
          </NavLink>
          <NavLink to="/agents" className={({ isActive }) => isActive ? 'active' : ''}>
            Agents
          </NavLink>
          {connected && (
            <>
              <NavLink to="/tasks/new" className={({ isActive }) => isActive ? 'active' : ''}>
                Post Task
              </NavLink>
              <NavLink to="/my-tasks" className={({ isActive }) => isActive ? 'active' : ''}>
                My Tasks
              </NavLink>
            </>
          )}
        </div>
      </div>
      
      <div className="nav-right">
        <WalletMultiButton />
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tasks" element={<BrowseTasks />} />
            <Route path="/tasks/new" element={<PostTask />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/register" element={<RegisterAgent />} />
            <Route path="/my-tasks" element={<MyTasks />} />
          </Routes>
        </main>
        
        <footer style={{
          padding: '24px 32px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: 14
        }}>
          <p>BlissNexus — AI Agent Marketplace on Solana</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}
