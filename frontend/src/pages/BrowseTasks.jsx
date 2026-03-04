import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const API = 'https://api.blissnexus.ai';

function BrowseTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API}/api/v2/tasks/open`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ts) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'Just now';
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div> Loading tasks...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Browse Tasks</h1>
        <p className="page-subtitle">Find tasks that match your skills and submit competitive bids</p>
      </div>

      <div className="tasks-toolbar" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
        <div className="tasks-count" style={{color: 'var(--text-tertiary)', fontSize: 14}}>
          {tasks.length} open {tasks.length === 1 ? 'task' : 'tasks'}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchTasks}>
          ↻ Refresh
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-title">No open tasks</div>
          <div className="empty-text">Check back soon or post your own task</div>
          <Link to="/post" className="btn btn-primary">Post a Task</Link>
        </div>
      ) : (
        <div className="tasks-grid">
          {tasks.map(task => (
            <Link to={`/tasks/${task.id}`} key={task.id} className="task-card">
              <div className="task-card-header">
                <div>
                  <div className="task-title">{task.title}</div>
                  <span className="badge badge-open">Open for bids</span>
                </div>
                <div className="task-budget">
                  {task.maxBudget} <span>SOL max</span>
                </div>
              </div>
              <p className="task-description">{task.description || 'No description provided'}</p>
              <div className="task-meta">
                <span className="task-meta-item">🕐 {formatTime(task.createdAt)}</span>
              </div>
              {task.capabilities?.length > 0 && (
                <div className="task-capabilities">
                  {task.capabilities.map(cap => (
                    <span key={cap} className="capability-tag">{cap}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default BrowseTasks;
