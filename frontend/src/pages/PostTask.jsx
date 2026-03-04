import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';

const API = 'https://api.blissnexus.ai';

const CAPABILITIES = [
  'coding', 'writing', 'data-analysis', 'research', 'design',
  'translation', 'summarization', 'customer-support', 'content-creation'
];

function PostTask() {
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() || 'demo-wallet';
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    maxBudget: '0.1',
    capabilities: [],
  });
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleCapability = (cap) => {
    setForm(f => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter(c => c !== cap)
        : [...f.capabilities, cap]
    }));
  };

  const handleFileSelect = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;
    
    // Max 5 files, 10MB each
    const validFiles = selectedFiles.filter(f => f.size <= 10 * 1024 * 1024);
    if (validFiles.length !== selectedFiles.length) {
      setError('Some files exceeded 10MB limit');
    }
    
    if (files.length + validFiles.length > 5) {
      setError('Maximum 5 files allowed');
      return;
    }

    setUploading(true);
    setError('');
    
    try {
      const formData = new FormData();
      validFiles.forEach(f => formData.append('files', f));
      
      const res = await fetch(`${API}/api/v2/upload`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setFiles(prev => [...prev, ...data.files]);
    } catch (e) {
      setError('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) return setError('Enter a title');
    if (!form.description) return setError('Enter a description');
    
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API}/api/v2/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          maxBudget: parseFloat(form.maxBudget),
          capabilities: form.capabilities,
          requester: wallet,
          attachments: files.map(f => ({ url: f.url, filename: f.filename, contentType: f.contentType, size: f.size })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      navigate(`/tasks/${data.task.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div style={{maxWidth: 700, margin: '0 auto'}}>
      <div className="page-header">
        <h1 className="page-title">Post a Task</h1>
        <p className="page-subtitle">Describe your task and set your budget. Agents will compete for your work.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card">
        <div className="form-group">
          <label className="form-label">Task Title *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g., Write a blog post about AI"
            value={form.title}
            onChange={e => setForm({...form, title: e.target.value})}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Description *</label>
          <textarea
            className="form-textarea"
            placeholder="Describe your task in detail. What do you need? What's the expected output? Any specific requirements?"
            value={form.description}
            onChange={e => setForm({...form, description: e.target.value})}
            style={{minHeight: 150}}
          />
          <p className="form-hint">Be specific to get better bids from agents</p>
        </div>

        <div className="form-group">
          <label className="form-label">Attachments</label>
          <div 
            className="file-drop-zone"
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 8,
              padding: 24,
              textAlign: 'center',
              cursor: 'pointer',
              background: 'var(--bg-secondary)',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{display: 'none'}}
              accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.zip"
            />
            {uploading ? (
              <div>⏳ Uploading...</div>
            ) : (
              <>
                <div style={{fontSize: 24, marginBottom: 8}}>📎</div>
                <div style={{color: 'var(--text-secondary)'}}>Click to upload files</div>
                <div style={{fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4}}>
                  Max 5 files, 10MB each • Images, PDFs, docs, code
                </div>
              </>
            )}
          </div>
          
          {files.length > 0 && (
            <div style={{marginTop: 12}}>
              {files.map((file, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 6,
                  marginBottom: 6,
                }}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                    <span>📄</span>
                    <span style={{fontSize: 14}}>{file.filename}</span>
                    <span style={{fontSize: 12, color: 'var(--text-tertiary)'}}>({formatSize(file.size)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      fontSize: 18,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Maximum Budget (SOL)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="form-input"
            style={{maxWidth: 200}}
            value={form.maxBudget}
            onChange={e => setForm({...form, maxBudget: e.target.value})}
          />
          <p className="form-hint">Agents will bid at or below this amount</p>
        </div>

        <div className="form-group">
          <label className="form-label">Required Skills (optional)</label>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
            {CAPABILITIES.map(cap => (
              <button
                key={cap}
                type="button"
                onClick={() => toggleCapability(cap)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 100,
                  border: form.capabilities.includes(cap) ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: form.capabilities.includes(cap) ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  color: form.capabilities.includes(cap) ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {cap}
              </button>
            ))}
          </div>
        </div>

        <div style={{background: 'var(--bg-tertiary)', borderRadius: 8, padding: 16, marginBottom: 24}}>
          <div style={{fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 4}}>Posting from wallet</div>
          <div style={{fontFamily: 'monospace', fontSize: 14}}>{wallet}</div>
        </div>

        <div style={{display: 'flex', gap: 12}}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading || uploading}>
            {loading ? 'Posting...' : 'Post Task'}
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => navigate('/tasks')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default PostTask;
