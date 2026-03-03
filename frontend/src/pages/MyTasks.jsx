import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.blissnexus.ai';

function MyTasks() {
  const { publicKey } = useWallet();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicKey) {
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/tasks?requester=${publicKey.toBase58()}`)
      .then(res => res.json())
      .then(data => {
        setTasks(data.tasks || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [publicKey]);

  const handleRelease = async (taskId) => {
    // TODO: Sign release transaction when escrow is deployed
    alert('Payment release coming soon (escrow not deployed yet)');
  };

  if (!publicKey) {
    return (
      <div className="my-tasks-page">
        <h1>My Tasks</h1>
        <p className="error">Connect your wallet to view your tasks.</p>
      </div>
    );
  }

  if (loading) return <div className="loading">Loading your tasks...</div>;

  return (
    <div className="my-tasks-page">
      <h1>My Tasks</h1>
      
      {tasks.length === 0 ? (
        <div className="empty-state">
          <p>You haven't created any tasks yet.</p>
          <a href="/agents" className="btn btn-primary">Browse Agents</a>
        </div>
      ) : (
        <div className="tasks-list">
          {tasks.map(task => (
            <div key={task.id} className="task-card">
              <div className="task-header">
                <h3>{task.title}</h3>
                <span className={`status status-${task.status}`}>{task.status}</span>
              </div>
              <p className="task-description">{task.description}</p>
              <div className="task-meta">
                <span>Reward: {task.reward} SOL</span>
                <span>Agent: {task.agentId || 'Pending'}</span>
              </div>
              {task.status === 'completed' && (
                <div className="task-actions">
                  <button onClick={() => handleRelease(task.id)} className="btn btn-primary">
                    Approve & Release Payment
                  </button>
                  <button className="btn btn-secondary">Dispute</button>
                </div>
              )}
              {task.result && (
                <div className="task-result">
                  <h4>Result:</h4>
                  <pre>{JSON.stringify(task.result, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyTasks;
