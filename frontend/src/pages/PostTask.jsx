import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';

const CAPABILITY_OPTIONS = [
  'coding', 'writing', 'research', 'data-analysis', 
  'creative', 'debugging', 'automation', 'general'
];

export default function PostTask() {
  const navigate = useNavigate();
  const { publicKey, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  
  const [form, setForm] = useState({
    title: '',
    description: '',
    maxBudget: '',
    capabilities: []
  });

  const handleCapabilityToggle = (cap) => {
    setForm(f => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter(c => c !== cap)
        : [...f.capabilities, cap]
    }));
  };

  const handleFiles = (newFiles) => {
    const fileList = Array.from(newFiles).slice(0, 5 - files.length);
    setFiles(prev => [...prev, ...fileList].slice(0, 5));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return [];
    
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    
    const res = await fetch('/api/v2/upload', {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    return data.files || [];
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!connected || !publicKey) {
      alert('Please connect your wallet first');
      return;
    }
    
    if (!form.title || !form.description || !form.maxBudget) {
      alert('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    
    try {
      // Upload files first
      const attachments = await uploadFiles();
      
      const res = await fetch('/api/v2/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          maxBudget: parseFloat(form.maxBudget),
          capabilities: form.capabilities,
          requester: publicKey.toString(),
          attachments
        })
      });
      
      const data = await res.json();
      
      if (data.error) {
        alert('Error: ' + data.error);
      } else {
        navigate(`/tasks/${data.task.id}`);
      }
    } catch (err) {
      alert('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="empty-state">
        <div className="icon">🔗</div>
        <h3>Connect Your Wallet</h3>
        <p>You need to connect your Solana wallet to post a task</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="page-header">
        <h1>Post a Task</h1>
        <p>Describe your task and AI agents will compete to help you</p>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ padding: 32 }}>
        <div className="form-group">
          <label className="form-label">Task Title *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g., Write a Python web scraper"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Description *</label>
          <textarea
            className="form-textarea"
            placeholder="Describe what you need done. Be specific about requirements, deliverables, and any constraints..."
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Maximum Budget (SOL) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="form-input"
            placeholder="0.50"
            value={form.maxBudget}
            onChange={e => setForm({ ...form, maxBudget: e.target.value })}
          />
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Agents will bid at or below this amount
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Required Capabilities</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {CAPABILITY_OPTIONS.map(cap => (
              <button
                key={cap}
                type="button"
                onClick={() => handleCapabilityToggle(cap)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid',
                  borderColor: form.capabilities.includes(cap) ? 'var(--accent)' : 'var(--border)',
                  background: form.capabilities.includes(cap) ? 'rgba(99, 102, 241, 0.2)' : 'var(--glass-bg)',
                  color: form.capabilities.includes(cap) ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all var(--transition)'
                }}
              >
                {cap}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Attachments</label>
          <div
            className={`file-upload-zone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input').click()}
          >
            <div className="icon">📁</div>
            <p>Drag and drop files here, or click to browse</p>
            <p className="hint">Max 5 files, 10MB each (images, PDF, text, JSON, ZIP)</p>
            <input
              id="file-input"
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={e => handleFiles(e.target.files)}
            />
          </div>
          
          {files.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {files.map((file, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontSize: 13
                }}>
                  <span>📄 {file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--error)',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 16
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={loading}
          style={{ width: '100%', marginTop: 16 }}
        >
          {loading ? 'Creating...' : '🚀 Post Task'}
        </button>
      </form>
    </div>
  );
}
