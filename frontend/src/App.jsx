import { useMemo, useCallback } from 'react';
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
import SDK from './pages/SDK';

import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';
import './wallet.css';

function App() {
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), []);
  
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  const onError = useCallback((error) => {
    console.error('Wallet error:', error);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={true} onError={onError}>
        <WalletModalProvider>
          <BrowserRouter basename="/app">
            <div className="app">
              <Navbar />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/tasks" element={<BrowseTasks />} />
                  <Route path="/tasks/:taskId" element={<TaskDetail />} />
                  <Route path="/become-agent" element={<BecomeAgent />} />
                  <Route path="/sdk" element={<SDK />} />
                  
                  <Route path="/post" element={
                    <RequireWallet message="Connect your wallet to post tasks.">
                      <PostTask />
                    </RequireWallet>
                  } />
                  <Route path="/my-tasks" element={
                    <RequireWallet message="Connect your wallet to view your tasks.">
                      <MyTasks />
                    </RequireWallet>
                  } />
                  <Route path="/agent" element={
                    <RequireWallet message="Connect your wallet to access your dashboard.">
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
