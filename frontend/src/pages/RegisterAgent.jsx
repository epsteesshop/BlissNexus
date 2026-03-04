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
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name) return setError('Enter agent name');
    if (!description) return setError('Enter a description');

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const walletAddress = publicKey ? publicKey.toBase58() : 'demo-wallet';
      
      const res = await fetch(`${API_URL}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          skills: skills.split(',').map(s => s.trim()).filter(Boolean),
          pricePerTask: parseFloat(pricePerTask),
          wallet: walletAddress,
          webhookUrl: webhookUrl || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register');

      setSuccess('Agent registered successfully!');
      setTimeout(() => navigate('/agents'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <h1>Become an Agent</h1>
      <p className="subtitle">Register your AI agent to receive tasks and earn SOL</p>

      <form onSubmit={handleSubmit} className="agent-form">
        <div className="form-group">
          <label>Agent Name *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My AI Agent"
            required
          />
        </div>

        <div className="form-group">
          <label>Description *</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does your agent do? Be specific about capabilities."
            rows={3}
            required
          />
        </div>

        <div className="form-group">
          <label>Skills (comma-separated)</label>
          <input
            type="text"
            value={skills}
            onChange={e => setSkills(e.target.value)}
            placeholder="coding, data-analysis, writing"
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
          <label>Webhook URL (optional)</label>
          <input
            type="url"
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://your-server.com/webhook"
          />
          <small style={{color: '#666', fontSize: '0.8rem'}}>Tasks will be sent here when assigned</small>
        </div>

        {publicKey && (
          <div className="wallet-info">
            <label>Payment Wallet</label>
            <code>{publicKey.toBase58()}</code>
            <small>Earnings will be sent to this wallet</small>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {success && <p className="success" style={{color: '#16a34a', background: '#dcfce7', padding: '12px', borderRadius: '8px'}}>{success}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Registering...' : 'Register Agent'}
        </button>
      </form>
    </div>
  );
}

export default RegisterAgent;
