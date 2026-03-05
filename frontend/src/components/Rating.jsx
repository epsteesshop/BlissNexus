import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export default function Rating({ taskId, task }) {
  const { publicKey } = useWallet();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingRatings, setExistingRatings] = useState([]);
  const [error, setError] = useState('');

  const userId = publicKey?.toString();
  const state = task?.state || task?.status;
  const requesterId = task?.requester_id || task?.requesterId || task?.requester;
  const assignedAgent = task?.assigned_agent || task?.assignedAgent;

  // Check if user is a participant
  const isRequester = userId === requesterId;
  const isAgent = userId === assignedAgent;
  const canRate = (isRequester || isAgent) && state === 'completed';

  // Load existing ratings
  useEffect(() => {
    if (!taskId) return;
    fetch(`/api/v2/tasks/${taskId}/ratings`)
      .then(r => r.json())
      .then(data => {
        setExistingRatings(data.ratings || []);
        // Check if current user already rated
        if (userId && data.ratings?.some(r => r.rater_id === userId)) {
          setSubmitted(true);
        }
      })
      .catch(() => {});
  }, [taskId, userId]);

  const submitRating = async () => {
    if (!rating || submitting) return;
    
    setSubmitting(true);
    setError('');
    
    try {
      const res = await fetch(`/api/v2/tasks/${taskId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raterId: userId,
          rating,
          review: review.trim() || null
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSubmitted(true);
        setExistingRatings(prev => [...prev, data.rating]);
      } else {
        setError(data.error || 'Failed to submit rating');
      }
    } catch (e) {
      setError('Failed to submit rating');
    }
    
    setSubmitting(false);
  };

  // Don't show if task not completed
  if (state !== 'completed') {
    return null;
  }

  // Show existing ratings
  const otherRating = existingRatings.find(r => r.rater_id !== userId);

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      background: 'var(--bg-secondary)',
      marginTop: 24
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>⭐ Ratings</h3>
      
      {/* Show other party's rating if exists */}
      {otherRating && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius)',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: '#f59e0b' }}>
              {'★'.repeat(otherRating.rating)}{'☆'.repeat(5 - otherRating.rating)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              from {otherRating.rater_role === 'requester' ? 'Task Creator' : 'Agent'}
            </span>
          </div>
          {otherRating.review && (
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              "{otherRating.review}"
            </div>
          )}
        </div>
      )}
      
      {/* Rating form */}
      {canRate && !submitted ? (
        <div>
          <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
            Rate the {isRequester ? 'agent' : 'task creator'}:
          </div>
          
          {/* Star picker */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 28,
                  cursor: 'pointer',
                  color: star <= (hover || rating) ? '#f59e0b' : '#d1d5db',
                  transition: 'transform 0.1s',
                  transform: star <= (hover || rating) ? 'scale(1.1)' : 'scale(1)'
                }}
              >
                ★
              </button>
            ))}
          </div>
          
          {/* Review textarea */}
          <textarea
            value={review}
            onChange={e => setReview(e.target.value)}
            placeholder="Write a review (optional)"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: 14,
              minHeight: 80,
              resize: 'vertical',
              marginBottom: 12
            }}
          />
          
          {error && (
            <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}
          
          <button
            onClick={submitRating}
            disabled={!rating || submitting}
            style={{
              padding: '10px 20px',
              background: rating ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: rating ? 'white' : 'var(--text-tertiary)',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontWeight: 600,
              cursor: rating ? 'pointer' : 'not-allowed'
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </button>
        </div>
      ) : submitted ? (
        <div style={{
          padding: '16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius)',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          ✓ You've rated this task
        </div>
      ) : !canRate && existingRatings.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
          No ratings yet
        </div>
      ) : null}
    </div>
  );
}
