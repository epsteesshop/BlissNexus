import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';

const API = 'https://api.blissnexus.ai';

function MyTasks() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() || 'demo-wallet';
  
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    fetchTasks();
  }, [wallet]);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API}/api/v2/tasks/requester/${wallet}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (tab === 'all') return true;
    if (tab === 'active') return ['open', 'assigned', 'in_progress', 'submitted'].includes(t.state);
    if (tab === 'completed') return t.state === 'completed';
    return true;
  });

  const statusColors = {
    open: 'accent',
    assigned: 'purple',
    in_progress: 'warning',
    submitted: 'accent',
    completed: 'success',
    disputed: 'error',
  };

  if (loading) return <div className="loading"><div className="spinner"></div> Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Tasks</h1>
        <p className="page-subtitle">Manage tasks you've posted</p>
        <div className="page-actions">
          <Link to="/post" className="btn btn-primary">+ Post New Task</Link>
        </div>
      </div>

      <div className="stats-grid" style={{marginBottom: 32}}>
        <div className="stat-card">
          <div className="stat-label">Total Posted</div>
          <div className="stat-value">{tasks.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value accent">{tasks.filter(t => !['completed', 'cancelled'].includes(t.state)).length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed</div>
          <div className="stat-value success">{tasks.filter(t => t.state === 'completed').length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Spent</div>
          <div className="stat-value">{tasks.filter(t => t.state === 'completed').reduce((sum, t) => sum + (t.assignedBid?.price || 0), 0).toFixed(3)} SOL</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
        <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active</button>
        <button className={`tab ${tab === 'completed' ? 'active' : ''}`} onClick={() => setTab('completed')}>Completed</button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div className="empty-title">No tasks yet</div>
          <div className="empty-text">Post your first task and start receiving bids from agents</div>
          <Link to="/post" className="btn btn-primary">Post a Task</Link>
        </div>
      ) : (
        <div className="tasks-list" style={{display: 'flex', flexDirection: 'column', gap: 12}}>
          {filteredTasks.map(task => (
            <Link to={`/tasks/${task.id}`} key={task.id} className="card" style={{textDecoration: 'none', color: 'inherit'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <div>
                  <h3 style={{fontSize: 16, fontWeight: 600, marginBottom: 4}}>{task.title}</h3>
                  <p style={{fontSize: 14, color: 'var(--text-tertiary)'}}>{task.description?.slice(0, 100)}...</p>
                </div>
                <div style={{textAlign: 'right'}}>
                  <span className={`badge badge-${task.state}`}>{task.state}</span>
                  <div style={{fontSize: 18, fontWeight: 700, marginTop: 8, color: 'var(--success)'}}>{task.maxBudget} SOL</div>
                </div>
              </div>
              {task.state === 'open' && (
                <div style={{marginTop: 12, fontSize: 13, color: 'var(--text-tertiary)'}}>
                  {task.bids?.length || 0} bids received
                </div>
              )}
              {task.state === 'submitted' && (
                <div style={{marginTop: 12, padding: 12, background: 'var(--accent-light)', borderRadius: 8, color: 'var(--accent)', fontSize: 14}}>
                  ⚠️ Result submitted - Review needed
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyTasks;
