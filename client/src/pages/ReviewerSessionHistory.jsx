import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import BackButton from '../components/BackButton';
import VideoPlayer from '../components/VideoPlayer';

function openAsset(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function isVideoAsset(item) {
  const source = String(item?.contentType || item?.fileName || item?.url || '').toLowerCase();
  return source.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(source);
}

function renderStatus(status) {
  const normalized = String(status || 'draft').toLowerCase();
  const cls =
    normalized === 'active'
      ? 'badge-active'
      : normalized === 'closed'
        ? 'badge-closed'
        : 'badge-draft';
  return <span className={`badge ${cls}`}>{normalized}</span>;
}

function formatTimestamp(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function HistoryThumb({ item, alt }) {
  const url = item?.url || '';
  return (
    <div className="history-thumb">
      {url ? (
        isVideoAsset(item) ? <video src={url} muted playsInline preload="metadata" /> : <img src={url} alt={alt} />
      ) : (
        <span className="history-thumb-fallback">F</span>
      )}
    </div>
  );
}

function HistoryVideoCommentPanel({ group }) {
  const playerRef = useRef(null);
  const [activeTimestamp, setActiveTimestamp] = useState(null);

  if (!group?.url) return null;

  return (
    <div className="video-comment-panel">
      <VideoPlayer
        ref={playerRef}
        src={group.url}
        className="video-comment-player"
        style={{ maxHeight: 'min(62vh, 520px)' }}
      />
      <div className="timestamp-comment-list">
        {group.comments.map((item, index) => {
          const hasTimestamp = item.timestampSec != null;
          const isActive = hasTimestamp && activeTimestamp === item.timestampSec;

          if (!hasTimestamp) {
            return (
              <div key={`${group.imageId}-static-${index}`} className="timestamp-comment-card">
                <div className="timestamp-comment-copy">{item.comment || 'Comment added'}</div>
              </div>
            );
          }

          return (
            <button
              key={`${group.imageId}-timestamp-${index}`}
              type="button"
              className={`timestamp-comment-card timestamp-comment-button${isActive ? ' timestamp-comment-button-active' : ''}`}
              onClick={() => {
                playerRef.current?.seekTo?.(item.timestampSec);
                playerRef.current?.pause?.();
                setActiveTimestamp(item.timestampSec);
              }}
            >
              <span className="timestamp-comment-badge">{formatTimestamp(item.timestampSec)}</span>
              <span className="timestamp-comment-copy">{item.comment || 'Comment added'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
        if (mounted) {
          setHistory(data);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || 'Failed to load review history');
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
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
          contentType: item.contentType,
          comments: [],
        };
      }
      acc[key].comments.push(item);
      return acc;
    }, {});

    return Object.values(byImage).sort((left, right) => {
      const leftOrder = Number(left.rowOrder) || Number.MAX_SAFE_INTEGER;
      const rightOrder = Number(right.rowOrder) || Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
  }, [history]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div style={{ color: 'var(--sub)', fontSize: 14 }}>Loading your review history...</div>
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
        <div className="header-bar history-header-bar" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <div className="results-header-main-left">
              <BackButton />
              <div className="logo">
                Creative<span>Swipe</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>
              My Review History
            </div>
          </div>
        </div>

        <div className="history-session-meta">
          <div className="dashboard-entity-label">Client</div>
          <div className="results-client-line results-client-line-with-status">
            <div className="history-session-client">{history?.session?.clientName || 'Client'}</div>
            {history?.session?.status ? renderStatus(history.session.status) : null}
          </div>
          <div className="dashboard-entity-label dashboard-entity-label-project" style={{ marginTop: 10 }}>Project</div>
          <div className="history-session-project">{history?.session?.projectName || history?.session?.title || 'Project'}</div>
        </div>

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
        <div className="history-list history-list-panel" style={{ marginBottom: 14 }}>
          {decisions.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>No decisions were submitted.</div>
          ) : (
            decisions.map((item) => (
              <div key={`${item.imageId}-${item.liked}`} className="history-card">
                <div className="history-card-main">
                  <HistoryThumb item={item} alt={item.fileName || item.imageId} />
                  <div className="history-card-copy">
                    <div className="history-card-title">{item.fileName || item.imageId}</div>
                    <div className="history-card-meta">
                      {item.rowOrder ? `Post ${item.rowOrder}` : 'Post unknown'}
                    </div>
                  </div>
                </div>
                <div className="history-card-side">
                  <span className={`history-status ${item.liked ? 'history-status-like' : 'history-status-dislike'}`}>
                    {item.liked ? 'Approved' : 'Rejected'}
                  </span>
                  <button className="history-view-btn" onClick={() => openAsset(item.url)} disabled={!item.url}>
                    View
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--sub)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Comments Given
        </h3>
        <div className="history-list history-list-panel" style={{ paddingBottom: 20 }}>
          {groupedComments.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>No comments were submitted.</div>
          ) : (
            groupedComments.map((group) => (
              <div key={group.imageId} className="history-comment-card">
                <div className="history-card">
                  <div className="history-card-main">
                    {!isVideoAsset(group) && <HistoryThumb item={group} alt={group.fileName || group.imageId} />}
                    <div className="history-card-copy">
                      <div className="history-card-title">{group.fileName || group.imageId}</div>
                      <div className="history-card-meta">
                        {group.rowOrder ? `Post ${group.rowOrder}` : 'Comment thread'}
                      </div>
                    </div>
                  </div>
                  <div className="history-card-side">
                    <button className="history-view-btn" onClick={() => openAsset(group.url)} disabled={!group.url}>
                      View
                    </button>
                  </div>
                </div>

                <div className="history-comment-list">
                  {group.comments.map((item, index) => (
                    <div key={`${group.imageId}-${index}`} className="history-comment-item">
                      <div className="history-comment-index">{index + 1}</div>
                      <div>
                        <div style={{ fontSize: 13, color: 'var(--text)' }}>{item.comment || 'Comment added'}</div>
                        <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 3 }}>
                          {item.timestampSec != null
                            ? <span className="timestamp-comment-inline">{formatTimestamp(item.timestampSec)}</span>
                            : ('Pin at x:' + Math.round(Number(item.x) || 0) + ' y:' + Math.round(Number(item.y) || 0))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {isVideoAsset(group) && group.url && (
                  <div className="video-review-thread">
                    <HistoryVideoCommentPanel group={group} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
