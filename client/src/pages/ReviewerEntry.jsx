import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

export default function ReviewerEntry() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    api
      .getPublicSessionPreview(sessionId)
      .then((data) => {
        if (mounted) setPreview(data);
      })
      .catch(() => {
        if (mounted) setPreview(null);
      })
      .finally(() => {
        if (mounted) setPreviewLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const handleJoin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.joinSession(sessionId, name.trim(), email.trim(), password || null);
      sessionStorage.setItem('reviewerName', name.trim());
      sessionStorage.setItem('reviewerEmail', email.trim());
      sessionStorage.setItem('reviewerSessionId', sessionId);
      navigate(`/r/${sessionId}/review`);
    } catch (err) {
      if (err.message?.includes('password')) setShowPassword(true);
      setError(err.message || 'Failed to join session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell" style={{ justifyContent: 'center' }}>
      <div
        className="page"
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100%' }}
      >
        <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
          <div className="anim-fade-up" style={{ textAlign: 'center', marginBottom: 32 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 24,
                background: 'linear-gradient(135deg, var(--accent-dim) 0%, rgba(61,255,143,0.08) 100%)',
                border: '1px solid rgba(232,255,71,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 800,
                margin: '0 auto 24px',
                transform: 'rotate(-6deg)',
                boxShadow: '0 8px 32px rgba(232,255,71,0.1)',
              }}
            >
              CS
            </div>
            <div className="logo" style={{ fontSize: 28, justifyContent: 'center', marginBottom: 12 }}>
              Creative<span>Swipe</span>
            </div>
            <p
              style={{
                fontSize: 15,
                color: 'var(--sub)',
                lineHeight: 1.6,
                maxWidth: 300,
                margin: '0 auto',
              }}
            >
              You have been invited to review creative assets. Swipe to approve or reject.
            </p>
          </div>

          <div className="glass-panel anim-fade-up" style={{ marginBottom: 16, padding: 14, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.08em',
                color: 'var(--sub)',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Work Preview
            </div>

            {previewLoading ? (
              <div style={{ height: 120, borderRadius: 10, background: 'rgba(255,255,255,0.05)' }} />
            ) : (preview?.previewImage?.url || preview?.previewImage?.signedUrl) ? (
              <div className="review-entry-preview-wrap">
                <img
                  src={preview.previewImage.url || preview.previewImage.signedUrl}
                  alt="Session preview"
                  className="review-entry-preview-blur"
                />
                <div className="review-entry-preview-overlay" />
              </div>
            ) : (
              <div
                style={{
                  height: 120,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--sub)',
                  fontSize: 12,
                }}
              >
                Preview unavailable
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--sub)' }}>
              <div style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 2 }}>
                {preview?.session?.title || 'Shared Review'}
              </div>
              <div>
                {preview?.session?.clientName || 'Client'} | {preview?.session?.projectName || 'Project'}
              </div>
              <div>{preview?.imageCount || 0} asset(s)</div>
            </div>
          </div>

          <form
            onSubmit={handleJoin}
            className="glass-panel anim-fade-up"
            style={{ animationDelay: '0.1s', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}
          >
            <div>
              <label className="field-label">Your Name</label>
              <input
                className="field"
                placeholder="Enter your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="field-label">Your Email</label>
              <input
                className="field"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            {showPassword && (
              <div className="anim-fade-up">
                <label className="field-label">Session Password</label>
                <input
                  className="field"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            )}

            {error && <div className="error-box">{error}</div>}

            <button type="submit" className="btn-accent" disabled={loading || !name.trim() || !email.trim()}>
              {loading ? 'Joining...' : 'Start Reviewing'}
            </button>
          </form>

          <div className="instruction-row anim-fade-up" style={{ animationDelay: '0.2s', marginTop: 32 }}>
            {[
              { iconClass: 'instruction-icon-reject', label: 'Reject' },
              { iconClass: 'instruction-icon-comment', label: 'Post Comment' },
              { iconClass: 'instruction-icon-approve', label: 'Approve' },
            ].map((item) => (
              <div key={item.label} className="instruction-item">
                <div className={`instruction-icon ${item.iconClass}`} />
                <span className="instruction-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
