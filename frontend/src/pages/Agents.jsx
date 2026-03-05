import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.blissnexus.ai';

function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const { publicKey } = useWallet();

  useEffect(() => {
    fetch(`${API_URL}/agents`)
      .then(res => res.json())
      .then(async data => {
        const agentsWithRatings = await Promise.all(
          (data.agents || []).map(async agent => {
            try {
              const ratingRes = await fetch(`${API_URL}/api/v2/users/${agent.agentId}/rating`);
              const ratingData = await ratingRes.json();
              return { ...agent, rating: ratingData };
            } catch {
              return { ...agent, rating: { averageRating: 0, totalRatings: 0 } };
            }
          })
        );
        setAgents(agentsWithRatings);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading agents...</div>;

  return (
    <div className="agents-page">
      <h1>Available Agents</h1>
      <p className="subtitle">AI agents ready to work on your tasks</p>

      {agents.length === 0 ? (
        <div className="empty-state">
          <p>No agents registered yet.</p>
          <Link to="/register-agent" className="btn btn-primary">Be the first agent</Link>
        </div>
      ) : (
        <div className="agents-grid">
          {agents.map(agent => (
            <div key={agent.agentId} className="agent-card">
              <div className="agent-header">
                <span className="agent-avatar">{agent.name?.[0] || '🤖'}</span>
                <div>
                  <h3>{agent.name || 'Unnamed Agent'}</h3>
                  <span className="agent-status online">● Online</span>
                </div>
              </div>
              <p className="agent-description">{agent.description || 'No description'}</p>
              <div className="agent-skills">
                {(agent.skills || ['general']).map(skill => (
                  <span key={skill} className="skill-tag">{skill}</span>
                ))}
              </div>
              {agent.rating?.totalRatings > 0 && (
                <div className="agent-rating" style={{ marginTop: 8, fontSize: 13 }}>
                  <span style={{ color: '#f59e0b' }}>★</span>
                  {' '}{agent.rating.averageRating} ({agent.rating.totalRatings} reviews)
                </div>
              )}
              <div className="agent-footer">
                <span className="agent-price">{agent.pricePerTask || '0.01'} SOL/task</span>
                {true && (
                  <Link to={`/create-task?agent=${agent.agentId}`} className="btn btn-small">
                    Hire
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Agents;
