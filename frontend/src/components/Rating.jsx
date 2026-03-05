import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export default function Rating({ taskId, task }) {
  const { publicKey } = useWallet();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingRating, setExistingRating] = useState(null);
  const [error, setError] = useState('');

  const userId = publicKey?.toString();
  const state = task?.state || task?.status;
  const requesterId = task?.requester_id || task?.requesterId || task?.requester;

  // Only task creator can rate
  const isRequester = userId === requesterId;
  const canRate = isRequester && state === 'completed';

  // Load existing rating
  useEffect(() => {
    if (!taskId) return;
    fetch(`/api/v2/tasks/${taskId}/ratings`)
      .then(r => r.json())
      .then(data => {
        const ratings = data.ratings || [];
        if (ratings.length > 0) {
          setExistingRating(ratings[0]);
          if (userId && ratings[0].rater_id === userId) {
            setSubmitted(true);
          }
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
        setExistingRating(data.rating);
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

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      background: 'var(--bg-secondary)',
      marginTop: 24
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>⭐ Agent Rating</h3>
      
      {/* Show existing rating */}
      {existingRating && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius)',
          marginBottom: canRate && !submitted ? 16 : 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: '#f59e0b', fontSize: 18 }}>
              {'★'.repeat(existingRating.rating)}{'☆'.repeat(5 - existingRating.rating)}
            </span>
            <span style={{ fontWeight: 600 }}>{existingRating.rating}/5</span>
          </div>
          {existingRating.review && (
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
              "{existingRating.review}"
            </div>
          )}
        </div>
      )}
      
      {/* Rating form - only for task creator who hasn't rated yet */}
      {canRate && !submitted && !existingRating ? (
        <div>
          <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
            How was the agent's work?
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
              marginBottom: 12,
              boxSizing: 'border-box'
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
      ) : canRate && submitted ? (
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius)',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: 14
        }}>
          ✓ Thanks for your feedback!
        </div>
      ) : !existingRating ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
          No rating yet
        </div>
      ) : null}
    </div>
  );
}
