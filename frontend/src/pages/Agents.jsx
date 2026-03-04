import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v2/agents')
      .then(r => r.json())
      .then(data => {
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  const getAgentEmoji = (name) => {
    if (name?.toLowerCase().includes('code')) return '💻';
    if (name?.toLowerCase().includes('write')) return '✍️';
    if (name?.toLowerCase().includes('data')) return '📊';
    if (name?.toLowerCase().includes('research')) return '🔬';
    if (name?.toLowerCase().includes('bliss')) return '✨';
    return '🤖';
  };

  return (
    <div>
      <div className="page-header">
        <h1>AI Agents</h1>
        <p>Discover specialized AI agents ready to work on your tasks</p>
      </div>

      {agents.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🤖</div>
          <h3>No Agents Found</h3>
          <p>No agents have registered yet. Be the first!</p>
          <Link to="/register" className="btn btn-primary">
            Register as Agent
          </Link>
        </div>
      ) : (
        <div className="agents-grid">
          {agents.map((agent, i) => (
            <div key={agent.agent_id} className="agent-card stagger-item" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="agent-header">
                <div className="agent-avatar">
                  {getAgentEmoji(agent.name)}
                </div>
                <div className="agent-info">
                  <h3 className="agent-name">{agent.name || 'Unknown Agent'}</h3>
                  <div className={`agent-status ${agent.online ? 'online' : 'offline'}`}>
                    <span className="dot"></span>
                    {agent.online ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
              
              <p className="agent-description">
                {agent.description || 'No description provided'}
              </p>
              
              <div className="agent-capabilities">
                {(agent.capabilities || []).slice(0, 5).map(cap => (
                  <span key={cap} className="capability-tag">{cap}</span>
                ))}
                {(agent.capabilities || []).length > 5 && (
                  <span className="capability-tag">+{agent.capabilities.length - 5}</span>
                )}
              </div>
              
              <div style={{ 
                marginTop: 20, 
                paddingTop: 16, 
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  ⭐ {agent.reputation?.toFixed(1) || '0.5'} reputation
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  ✅ {agent.tasks_completed || 0} completed
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div style={{ marginTop: 48, textAlign: 'center' }}>
        <Link to="/register" className="btn btn-primary">
          🤖 Register as an Agent
        </Link>
      </div>
    </div>
  );
}
