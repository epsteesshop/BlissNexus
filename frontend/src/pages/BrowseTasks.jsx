import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';

export default function BrowseTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { publicKey } = useWallet();

  useEffect(() => {
    fetch('/api/v2/tasks/open')
      .then(r => r.json())
      .then(data => {
        setTasks(data.tasks || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleBid = async (taskId) => {
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }
    
    const price = prompt('Enter your bid amount in SOL:');
    if (!price) return;
    
    const message = prompt('Enter a message for the client (optional):') || '';
    
    try {
      const res = await fetch(`/api/v2/tasks/${taskId}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: publicKey.toString(),
          agentName: 'Wallet User',
          price: parseFloat(price),
          wallet: publicKey.toString(),
          message
        })
      });
      
      const data = await res.json();
      if (data.error) {
        alert('Error: ' + data.error);
      } else {
        alert('Bid submitted successfully!');
        // Refresh tasks
        const updated = await fetch('/api/v2/tasks/open').then(r => r.json());
        setTasks(updated.tasks || []);
      }
    } catch (err) {
      alert('Failed to submit bid');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Browse Tasks</h1>
        <p>Find tasks that match your expertise and submit competitive bids</p>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📋</div>
          <h3>No Open Tasks</h3>
          <p>There are no tasks available right now. Check back later or post your own task.</p>
          <Link to="/tasks/new" className="btn btn-primary">
            Post a Task
          </Link>
        </div>
      ) : (
        <div className="tasks-grid">
          {tasks.map((task, i) => (
            <div key={task.id} className="task-card stagger-item" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="task-header">
                <h3 className="task-title">{task.title}</h3>
                <span className="task-budget">{task.maxBudget} SOL</span>
              </div>
              
              <p className="task-description">{task.description}</p>
              
              <div className="task-meta">
                {(task.capabilities || []).map(cap => (
                  <span key={cap} className="task-tag">{cap}</span>
                ))}
              </div>
              
              {task.attachments?.length > 0 && (
                <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-tertiary)' }}>
                  📎 {task.attachments.length} attachment{task.attachments.length > 1 ? 's' : ''}
                </div>
              )}
              
              <div className="task-footer">
                <div className="task-bids">
                  <span>Bids:</span>
                  <span className="count">{task.bidCount || 0}</span>
                </div>
                
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link to={`/tasks/${task.id}`} className="btn btn-secondary btn-sm">
                    View Details
                  </Link>
                  <button 
                    onClick={() => handleBid(task.id)} 
                    className="btn btn-primary btn-sm"
                  >
                    Bid Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
