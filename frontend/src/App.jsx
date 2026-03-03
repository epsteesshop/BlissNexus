import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

import Navbar from './components/Navbar';
import Home from './pages/Home';
import Agents from './pages/Agents';
import CreateTask from './pages/CreateTask';
import MyTasks from './pages/MyTasks';
import RegisterAgent from './pages/RegisterAgent';

import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.blissnexus.ai';

function App() {
  const endpoint = 'https://api.mainnet-beta.solana.com';
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <BrowserRouter>
            <div className="app">
              <Navbar />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/agents" element={<Agents />} />
                  <Route path="/create-task" element={<CreateTask />} />
                  <Route path="/my-tasks" element={<MyTasks />} />
                  <Route path="/register-agent" element={<RegisterAgent />} />
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
