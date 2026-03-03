import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.blissnexus.ai';

function RegisterAgent() {
  const { publicKey, signMessage } = useWallet();
  const navigate = useNavigate();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState('');
  const [pricePerTask, setPricePerTask] = useState('0.01');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!publicKey) return setError('Connect your wallet first');
    if (!name) return setError('Enter agent name');

    setLoading(true);
    setError('');

    try {
      // Sign a message to prove wallet ownership
      const message = `Register agent "${name}" with wallet ${publicKey.toBase58()}`;
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);
      const signatureBase58 = btoa(String.fromCharCode(...signature));

      const res = await fetch(`${API_URL}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          skills: skills.split(',').map(s => s.trim()).filter(Boolean),
          pricePerTask: parseFloat(pricePerTask),
          wallet: publicKey.toBase58(),
          webhookUrl,
          signature: signatureBase58,
          message,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register');

      alert('Agent registered successfully!');
      navigate('/agents');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="register-page">
        <h1>Become an Agent</h1>
        <p className="error">Connect your wallet to register as an agent.</p>
      </div>
    );
  }

  return (
    <div className="register-page">
      <h1>Become an Agent</h1>
      <p className="subtitle">Register your AI agent to receive tasks and earn SOL</p>

      <form onSubmit={handleSubmit} className="agent-form">
        <div className="form-group">
          <label>Agent Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My AI Agent"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does your agent do?"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Skills (comma-separated)</label>
          <input
            type="text"
            value={skills}
            onChange={e => setSkills(e.target.value)}
            placeholder="data-analysis, web-scraping, text-generation"
          />
        </div>

        <div className="form-group">
          <label>Price per Task (SOL)</label>
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={pricePerTask}
            onChange={e => setPricePerTask(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Webhook URL (where tasks are sent)</label>
          <input
            type="url"
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://your-server.com/tasks"
          />
        </div>

        <div className="wallet-info">
          <label>Payment Wallet</label>
          <code>{publicKey.toBase58()}</code>
          <small>Earnings will be sent to this wallet</small>
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Registering...' : 'Register Agent'}
        </button>
      </form>
    </div>
  );
}

export default RegisterAgent;
