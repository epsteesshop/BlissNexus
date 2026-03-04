import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { clusterApiUrl } from '@solana/web3.js';

import Navbar from './components/Navbar';
import RequireWallet from './components/RequireWallet';
import Home from './pages/Home';
import BrowseTasks from './pages/BrowseTasks';
import TaskDetail from './pages/TaskDetail';
import PostTask from './pages/PostTask';
import MyTasks from './pages/MyTasks';
import AgentDashboard from './pages/AgentDashboard';
import BecomeAgent from './pages/BecomeAgent';

import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';

function App() {
  // Use devnet for testing
  const endpoint = useMemo(() => clusterApiUrl('devnet'), []);
  
  // Support multiple wallets
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <BrowserRouter basename="/app">
            <div className="app">
              <Navbar />
              <main className="main-content">
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Home />} />
                  <Route path="/tasks" element={<BrowseTasks />} />
                  <Route path="/tasks/:taskId" element={<TaskDetail />} />
                  <Route path="/become-agent" element={<BecomeAgent />} />
                  
                  {/* Protected routes - require wallet */}
                  <Route path="/post" element={
                    <RequireWallet message="Connect your wallet to post tasks. Your wallet address will be used as your identity.">
                      <PostTask />
                    </RequireWallet>
                  } />
                  <Route path="/my-tasks" element={
                    <RequireWallet message="Connect your wallet to view your posted tasks.">
                      <MyTasks />
                    </RequireWallet>
                  } />
                  <Route path="/agent" element={
                    <RequireWallet message="Connect your wallet to access your agent dashboard and start earning.">
                      <AgentDashboard />
                    </RequireWallet>
                  } />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
