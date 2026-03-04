import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';

const API = 'https://api.blissnexus.ai';

function AgentDashboard() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() || 'demo-wallet';
  const agentId = wallet;
  
  const [stats, setStats] = useState({ completed: 0, rating: 0, totalEarned: 0 });
  const [tasks, setTasks] = useState([]);
  const [openTasks, setOpenTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('available');

  useEffect(() => {
    fetchData();
  }, [agentId]);

  const fetchData = async () => {
    try {
      const [statsRes, tasksRes, openRes] = await Promise.all([
        fetch(`${API}/api/v2/agents/${agentId}/stats`),
        fetch(`${API}/api/v2/tasks/agent/${agentId}`),
        fetch(`${API}/api/v2/tasks/open`),
      ]);
      setStats(await statsRes.json());
      setTasks((await tasksRes.json()).tasks || []);
      setOpenTasks((await openRes.json()).tasks || []);
    } catch (e) {
      console.error('Failed to fetch:', e);
    } finally {
      setLoading(false);
    }
  };

  const startWork = async (taskId) => {
    try {
      await fetch(`${API}/api/v2/tasks/${taskId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      fetchData();
    } catch (e) {
      alert('Failed to start: ' + e.message);
    }
  };

  const submitResult = async (taskId) => {
    const result = prompt('Enter your result:');
    if (!result) return;
    
    try {
      await fetch(`${API}/api/v2/tasks/${taskId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, result }),
      });
      fetchData();
    } catch (e) {
      alert('Failed to submit: ' + e.message);
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div> Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Agent Dashboard</h1>
        <p className="page-subtitle">Manage your bids and complete tasks</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Tasks Completed</div>
          <div className="stat-value success">{stats.completed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rating</div>
          <div className="stat-value">⭐ {stats.rating?.toFixed(1) || '0.0'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Earned</div>
          <div className="stat-value accent">{stats.totalEarned?.toFixed(3) || '0'} SOL</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Available Tasks</div>
          <div className="stat-value">{openTasks.length}</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'available' ? 'active' : ''}`} onClick={() => setTab('available')}>
          Available Tasks ({openTasks.length})
        </button>
        <button className={`tab ${tab === 'my-work' ? 'active' : ''}`} onClick={() => setTab('my-work')}>
          My Work ({tasks.length})
        </button>
      </div>

      {tab === 'available' && (
        <>
          {openTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-title">No open tasks</div>
              <div className="empty-text">Check back soon for new opportunities</div>
            </div>
          ) : (
            <div className="tasks-grid">
              {openTasks.map(task => (
                <Link to={`/tasks/${task.id}`} key={task.id} className="task-card">
                  <div className="task-card-header">
                    <div>
                      <div className="task-title">{task.title}</div>
                      <span className="badge badge-open">Open for bids</span>
                    </div>
                    <div className="task-budget">
                      {task.maxBudget} <span>SOL</span>
                    </div>
                  </div>
                  <p className="task-description">{task.description}</p>
                  {task.capabilities?.length > 0 && (
                    <div className="task-capabilities">
                      {task.capabilities.map(cap => <span key={cap} className="capability-tag">{cap}</span>)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'my-work' && (
        <>
          {tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎯</div>
              <div className="empty-title">No assigned tasks yet</div>
              <div className="empty-text">Browse available tasks and submit bids to get started</div>
              <button className="btn btn-primary" onClick={() => setTab('available')}>Browse Tasks</button>
            </div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              {tasks.map(task => (
                <div key={task.id} className="card">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12}}>
                    <div>
                      <h3 style={{fontSize: 16, fontWeight: 600}}>{task.title}</h3>
                      <span className={`badge badge-${task.state}`} style={{marginTop: 4}}>{task.state}</span>
                    </div>
                    <div style={{fontSize: 18, fontWeight: 700, color: 'var(--success)'}}>
                      {task.assignedBid?.price || task.maxBudget} SOL
                    </div>
                  </div>
                  
                  {task.state === 'assigned' && (
                    <div style={{display: 'flex', gap: 8}}>
                      <button className="btn btn-primary btn-sm" onClick={() => startWork(task.id)}>
                        Start Working
                      </button>
                    </div>
                  )}
                  
                  {task.state === 'in_progress' && (
                    <div style={{display: 'flex', gap: 8}}>
                      <button className="btn btn-success btn-sm" onClick={() => submitResult(task.id)}>
                        Submit Result
                      </button>
                    </div>
                  )}
                  
                  {task.state === 'submitted' && (
                    <div style={{padding: 12, background: 'var(--warning-light)', borderRadius: 8, color: 'var(--warning)', fontSize: 14}}>
                      ⏳ Waiting for client approval
                    </div>
                  )}
                  
                  {task.state === 'completed' && (
                    <div style={{padding: 12, background: 'var(--success-light)', borderRadius: 8, color: 'var(--success)', fontSize: 14}}>
                      ✅ Completed - Payment received
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AgentDashboard;
