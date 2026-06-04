import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import BackButton from '../components/BackButton';

export default function ReviewerSessionHistory() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let mounted = true;

    api
      .getReviewerSessionHistory(sessionId)
      .then((data) => {
        if (mounted) setHistory(data);
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Failed to load review history');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const groupedComments = useMemo(() => {
    if (!history?.annotations) return [];

    const byImage = history.annotations.reduce((acc, item) => {
      const key = item.imageId || 'unknown';
      if (!acc[key]) {
        acc[key] = {
          imageId: key,
          fileName: item.fileName,
          rowOrder: item.rowOrder,
          url: item.url,
          comments: [],
        };
      }
      acc[key].comments.push(item);
      return acc;
    }, {});

    return Object.values(byImage).sort((a, b) => {
      const left = Number(a.rowOrder) || Number.MAX_SAFE_INTEGER;
      const right = Number(b.rowOrder) || Number.MAX_SAFE_INTEGER;
      return left - right;
    });
  }, [history]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div style={{ color: 'var(--sub)', fontSize: 14 }}>Loading your review history…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="page" style={{ paddingTop: 12 }}>
          <BackButton />
          <div className="error-box" style={{ marginTop: 14 }}>{error}</div>
        </div>
      </div>
    );
  }

  const decisions = history?.decisions || [];
  const summary = history?.submission || {};

  return (
    <div className="app-shell">
      <div className="page" style={{ paddingTop: 12 }}>
        <div className="header-bar" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <BackButton />
            <div>
              <div className="logo">
                Creative<span>Swipe</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 4 }}>
                My Review History
              </div>
            </div>
          </div>
          <button className="btn-ghost" onClick={() => navigate('/reviewer')}>Dashboard</button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 10 }}>
          <strong style={{ color: 'var(--text)' }}>{history?.session?.clientName || 'Client'}</strong> · {history?.session?.projectName || 'Project'}
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{history?.session?.title || 'Review Session'}</h2>

        <div className="stats-grid-3" style={{ marginBottom: 12 }}>
          <div className="stat-card">
            <div className="num" style={{ color: 'var(--like)' }}>{summary.approvedCount || 0}</div>
            <div className="label">Approved</div>
          </div>
          <div className="stat-card">
            <div className="num" style={{ color: 'var(--dislike)' }}>{summary.rejectedCount || 0}</div>
            <div className="label">Rejected</div>
          </div>
          <div className="stat-card">
            <div className="num" style={{ color: 'var(--accent)' }}>{summary.annotationCount || 0}</div>
            <div className="label">Comments</div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 14 }}>
          Submitted: {summary.submittedAt ? new Date(summary.submittedAt).toLocaleString() : 'Unknown'}
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--sub)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Decisions Given
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {decisions.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>No decisions were submitted.</div>
          ) : (
            decisions.map((item) => (
              <div key={`${item.imageId}-${item.liked}`} className="session-item" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.fileName || item.imageId}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 3 }}>
                      {item.rowOrder ? `Post ${item.rowOrder}` : 'Post unknown'}
                    </div>
                  </div>
                  <span className={`dashboard-reviewer-state ${item.liked ? 'dashboard-reviewer-done' : 'dashboard-reviewer-pending'}`}>
                    {item.liked ? 'Approved' : 'Rejected'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--sub)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Comments Given
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 20 }}>
          {groupedComments.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>No comments were submitted.</div>
          ) : (
            groupedComments.map((group) => (
              <div key={group.imageId} className="session-item" style={{ cursor: 'default' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  {group.fileName || group.imageId} {group.rowOrder ? `· Post ${group.rowOrder}` : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.comments.map((item, idx) => (
                    <div key={`${group.imageId}-${idx}`} style={{ borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)', paddingTop: idx === 0 ? 0 : 6 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{item.comment || 'Comment added'}</div>
                      <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 3 }}>
                        Pin at x:{Math.round(Number(item.x) || 0)} y:{Math.round(Number(item.y) || 0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
