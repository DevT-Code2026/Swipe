import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ReviewComplete() {
  const navigate = useNavigate();
  const location = useLocation();
  const { reviewerAccountToken, reviewer } = useAuth();
  const state = location.state || {};
  const { totalImages = 0, liked = 0, disliked = 0, annotationCount = 0 } = state;

  const handleViewDashboard = () => {
    const submittedName = sessionStorage.getItem('reviewerName') || '';
    const submittedEmail = String(sessionStorage.getItem('reviewerEmail') || '').trim().toLowerCase();
    const activeReviewerEmail = String(reviewer?.email || '').trim().toLowerCase();

    if (reviewerAccountToken && submittedEmail && activeReviewerEmail && submittedEmail === activeReviewerEmail) {
      navigate('/reviewer');
      return;
    }

    navigate('/reviewer/login', {
      state: {
        mode: 'register',
        name: submittedName,
        email: submittedEmail,
        notice:
          'You reviewed with a different email than the receiver account currently signed in. Continue with this email to see the correct dashboard.',
      },
    });
  };

  return (
    <div className="app-shell complete-screen">
      <div className="complete-icon-badge fade-in" aria-hidden="true">
        <span className="complete-icon-glyph" />
      </div>

      <div className="fade-in">
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
          Thank You!
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 15, lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
          Your feedback has been submitted successfully.
          The creative team will review your input.
        </p>
      </div>

      <div className="fade-in" style={{ display: 'flex', gap: 12, marginTop: 28, animationDelay: '0.15s' }}>
        <div className="stat-card glass-card" style={{ minWidth: 85, flex: 1 }}>
          <div className="num" style={{ fontSize: 32, color: 'var(--like)' }}>{liked}</div>
          <div className="label">Approved</div>
        </div>
        <div className="stat-card glass-card" style={{ minWidth: 85, flex: 1 }}>
          <div className="num" style={{ fontSize: 32, color: 'var(--dislike)' }}>{disliked}</div>
          <div className="label">Rejected</div>
        </div>
        {annotationCount > 0 && (
          <div className="stat-card glass-card" style={{ minWidth: 85, flex: 1 }}>
            <div className="num" style={{ fontSize: 32, color: 'var(--accent)' }}>{annotationCount}</div>
            <div className="label">Notes</div>
          </div>
        )}
      </div>

      <div
        className="glass-panel fade-in"
        style={{
          padding: '16px 24px',
          marginTop: 24,
          fontSize: 14,
          color: 'var(--sub)',
          lineHeight: 1.8,
          animationDelay: '0.25s',
          maxWidth: 360,
        }}
      >
        <div>
          <strong style={{ color: 'var(--text)' }}>{totalImages}</strong> images reviewed
        </div>
        <div>Your review link is now used and cannot be resubmitted</div>
      </div>

      <button
        type="button"
        className="btn-accent fade-in"
        onClick={handleViewDashboard}
        style={{ width: '100%', maxWidth: 360, marginTop: 8, animationDelay: '0.33s' }}
      >
        View Dashboard
      </button>

      <div className="fade-in" style={{ marginTop: 32, animationDelay: '0.35s' }}>
        <div className="logo" style={{ fontSize: 18, opacity: 0.4 }}>
          Creative<span>Swipe</span>
        </div>
      </div>
    </div>
  );
}
