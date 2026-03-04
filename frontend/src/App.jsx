import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { clusterApiUrl } from '@solana/web3.js';

import Navbar from './components/Navbar';
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
                  <Route path="/" element={<Home />} />
                  <Route path="/tasks" element={<BrowseTasks />} />
                  <Route path="/tasks/:taskId" element={<TaskDetail />} />
                  <Route path="/post" element={<PostTask />} />
                  <Route path="/my-tasks" element={<MyTasks />} />
                  <Route path="/agent" element={<AgentDashboard />} />
                  <Route path="/become-agent" element={<BecomeAgent />} />
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
