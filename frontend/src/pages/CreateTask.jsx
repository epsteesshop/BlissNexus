import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.blissnexus.ai';

function CreateTask() {
  const { publicKey, signMessage } = useWallet();
  const { connection } = useConnection();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(searchParams.get('agent') || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('0.01');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/agents`)
      .then(res => res.json())
      .then(data => setAgents(data.agents || []))
      .catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!publicKey) return setError('Connect your wallet first');
    if (!selectedAgent) return setError('Select an agent');
    if (!title) return setError('Enter a title');

    setLoading(true);
    setError('');

    try {
      // Create task in backend
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          agentId: selectedAgent,
          reward: parseFloat(reward),
          requester: publicKey.toBase58(),
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');

      // TODO: When escrow is deployed, sign the funding transaction here
      alert('Task created! (Escrow payment coming soon)');
      navigate('/my-tasks');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="create-task-page">
        <h1>Create a Task</h1>
        <p className="error">Please connect your wallet to create tasks.</p>
      </div>
    );
  }

  return (
    <div className="create-task-page">
      <h1>Create a Task</h1>
      <form onSubmit={handleSubmit} className="task-form">
        <div className="form-group">
          <label>Select Agent</label>
          <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}>
            <option value="">-- Choose an agent --</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.pricePerTask || '0.01'} SOL)
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Task Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="What do you need done?"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the task in detail..."
            rows={5}
          />
        </div>

        <div className="form-group">
          <label>Reward (SOL)</label>
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={reward}
            onChange={e => setReward(e.target.value)}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Task & Fund Escrow'}
        </button>
      </form>
    </div>
  );
}

export default CreateTask;
