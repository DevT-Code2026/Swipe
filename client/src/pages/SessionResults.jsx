import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import AnnotationView from '../components/AnnotationView';
import VideoPlayer from '../components/VideoPlayer';

function formatRelativeTime(value) {
  if (!value) return 'No recent activity';
  const time = new Date(value).getTime();
  if (!time) return 'No recent activity';
  const delta = Math.max(0, Date.now() - time);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function normalizeText(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function formatTimestamp(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function openAsset(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function isVideoAsset(asset) {
  const source = String(asset?.contentType || asset?.fileName || '').toLowerCase();
  return source.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(source);
}

function getAssetTypeLabel(asset) {
  const contentType = String(asset?.contentType || asset?.fileName || '').toLowerCase();
  if (isVideoAsset(asset)) return 'Video';
  if (contentType.startsWith('audio/') || /\.(mp3|wav|ogg|aac|flac)$/i.test(asset?.fileName || '')) return 'Audio';
  if (contentType === 'application/pdf' || /\.pdf$/i.test(asset?.fileName || '')) return 'PDF';
  return 'Image';
}

function FileCard({ image, onDelete, deleting }) {
  const previewUrl = image.url || image.signedUrl || '';
  const isVideo = isVideoAsset(image);
  const typeLabel = getAssetTypeLabel(image);

  return (
    <article className="asset-card">
      <div className="asset-card-media">
        {previewUrl ? (
          isVideo ? (
            <video src={previewUrl} muted playsInline preload="metadata" />
          ) : (
            <img src={previewUrl} alt={image.fileName || 'Asset'} />
          )
        ) : (
          <div className="asset-card-fallback">{typeLabel}</div>
        )}
      </div>

      <div className="asset-card-body">
        <div className="asset-card-top">
          <div className="asset-card-title">{normalizeText(image.fileName, 'Untitled asset')}</div>
          <div className="asset-card-meta">{image.rowOrder ? `Post ${image.rowOrder}` : typeLabel}</div>
        </div>

        <div className="asset-card-actions asset-card-actions-below">
          <button type="button" className="history-view-btn" onClick={() => openAsset(previewUrl)} disabled={!previewUrl}>
            View
          </button>
          <button
            type="button"
            className="history-view-btn danger"
            onClick={() => onDelete(image.id)}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>

        <div className="asset-card-summary">
          <span className="metric-chip metric-chip-like">{image.likes || 0}</span>
          <span className="metric-chip metric-chip-dislike">{image.dislikes || 0}</span>
          <span>Comments {(image.annotations || []).length}</span>
        </div>
      </div>
    </article>
  );
}

function VideoCommentPanel({ image, comments }) {
  const playerRef = useRef(null);
  const previewUrl = image?.url || image?.signedUrl || '';
  const [activeTimestamp, setActiveTimestamp] = useState(null);

  if (!previewUrl) return null;

  return (
    <div className="video-comment-panel">
      <VideoPlayer
        ref={playerRef}
        src={previewUrl}
        className="video-comment-player"
        style={{ maxHeight: 'min(62vh, 520px)' }}
      />
      <div className="timestamp-comment-list">
        {comments.map((comment, commentIndex) => {
          const hasTimestamp = comment.timestampSec != null;
          const isActive = hasTimestamp && activeTimestamp === comment.timestampSec;

          if (!hasTimestamp) {
            return (
              <div key={`video-comment-static-${commentIndex}`} className="timestamp-comment-card">
                <div className="timestamp-comment-copy">{normalizeText(comment.comment, 'No comment')}</div>
              </div>
            );
          }

          return (
            <button
              key={`video-comment-${commentIndex}`}
              type="button"
              className={`timestamp-comment-card timestamp-comment-button${isActive ? ' timestamp-comment-button-active' : ''}`}
              onClick={() => {
                playerRef.current?.seekTo?.(comment.timestampSec);
                playerRef.current?.pause?.();
                setActiveTimestamp(comment.timestampSec);
              }}
            >
              <span className="timestamp-comment-badge">{formatTimestamp(comment.timestampSec)}</span>
              <span className="timestamp-comment-copy">{normalizeText(comment.comment, 'No comment')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SessionResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('files');
  const [copied, setCopied] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletingImage, setDeletingImage] = useState(null);
  const [selectedReviewer, setSelectedReviewer] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getSession(id);
      setSession(data.session);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleExport = async (format) => {
    try {
      await api.exportSession(id, format);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const toggleStatus = async () => {
    const newStatus = session.status === 'active' ? 'closed' : 'active';
    await api.updateSession(id, { status: newStatus });
    fetchData();
  };

  const handleDelete = async () => {
    try {
      await api.deleteSession(id);
      navigate('/');
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleDeleteImage = async (imageId) => {
    if (!window.confirm('Delete this asset?')) return;
    setDeletingImage(imageId);
    try {
      await api.deleteImage(id, imageId);
      fetchData();
    } catch (err) {
      alert(`Failed to delete image: ${err.message}`);
    } finally {
      setDeletingImage(null);
    }
  };

  const reviewUrl = api.getPublicReviewUrl(id);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.querySelector('.share-link-url');
      if (input) {
        input.focus();
        input.select();
      }
    }
  };

  const images = session?.images || [];
  const submissions = session?.submissions || [];
  const totalLikes = images.reduce((sum, item) => sum + (item.likes || 0), 0);
  const totalDislikes = images.reduce((sum, item) => sum + (item.dislikes || 0), 0);
  const totalAnnotations = images.reduce((sum, item) => sum + (item.annotations?.length || 0), 0);
  const lastActivityAt = useMemo(() => {
    const times = [
      ...submissions.map((item) => item.submittedAt).filter(Boolean),
      ...images.flatMap((item) => (item.annotations || []).map((annotation) => annotation.createdAt)).filter(Boolean),
    ].map((value) => new Date(value).getTime());

    if (!times.length) return null;
    return new Date(Math.max(...times)).toISOString();
  }, [images, submissions]);

  const visibleSubmissions = useMemo(() => {
    if (selectedReviewer === null) return submissions;
    return submissions[selectedReviewer] ? [submissions[selectedReviewer]] : [];
  }, [selectedReviewer, submissions]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="page">
          <div className="error-box">{error}</div>
          <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="app-shell">
      <div className="page results-page">
        <header className="results-header">
          <div className="results-header-main">
            <div className="results-header-main-left">
              <button type="button" className="btn-back" onClick={() => navigate(-1)}>
                &lt; Back
              </button>
              <div className="logo logo-no-dot">
                Creative<span>Swipe</span>
              </div>
            </div>
          </div>
            <div className="results-header-copy">
              <div className="results-meta-group">
                <div className="dashboard-entity-label results-entity-label">Client</div>
                <div className="results-client-line results-client-line-with-status">
                  <div className="results-client-name">
                    {normalizeText(session.clientName, 'Client')}
                </div>
                <span className={`badge badge-${session.status}`}>{session.status}</span>
              </div>
            </div>
              <div className="results-meta-group">
                <div className="dashboard-entity-label results-entity-label">Project</div>
                <div className="results-project-name">{normalizeText(session.projectName || session.title, 'Project')}</div>
              </div>
            </div>
        </header>

        <section className="results-panel">
          <div className="share-link-box">
            <input
              className="share-link-url"
              type="text"
              readOnly
              value={reviewUrl}
              onFocus={(event) => event.target.select()}
            />
            <button type="button" className="share-link-action" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </div>

          <div className="results-stats-grid">
            <div className="stat-card">
              <div className="num">{submissions.length}</div>
              <div className="label">Reviews</div>
            </div>
            <div className="stat-card">
              <div className="num" style={{ color: 'var(--like)' }}>{totalLikes}</div>
              <div className="label">Positive</div>
            </div>
            <div className="stat-card">
              <div className="num" style={{ color: 'var(--dislike)' }}>{totalDislikes}</div>
              <div className="label">Negative</div>
            </div>
            <div className="stat-card">
              <div className="num" style={{ color: 'var(--accent)' }}>{totalAnnotations}</div>
              <div className="label">Comments</div>
            </div>
          </div>

          <div className="results-summary-row">
            <div className="results-summary-counts">
              <span className="metric-chip metric-chip-like">{totalLikes}</span>
              <span className="metric-chip metric-chip-dislike">{totalDislikes}</span>
              <span>Comments {totalAnnotations}</span>
            </div>
            <div className="results-summary-time">{formatRelativeTime(lastActivityAt)}</div>
          </div>
        </section>

        <section className="results-actions">
          <button type="button" className="btn-secondary" onClick={toggleStatus}>
            {session.status === 'active' ? 'Close Project' : 'Reopen Project'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => handleExport('xlsx')}>
            Export XLSX
          </button>
          <button type="button" className="btn-secondary" onClick={() => handleExport('csv')}>
            Export CSV
          </button>
          <button type="button" className="btn-danger" onClick={() => setShowDelete(true)}>
            Delete Current Review
          </button>
        </section>

        <div className="results-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'files' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            Files
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'reviews' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            Reviews
          </button>
        </div>

        {activeTab === 'files' && (
          <section className="asset-grid">
            {images.length === 0 ? (
              <div className="results-empty">No assets uploaded yet.</div>
            ) : (
              images.map((image) => (
                <FileCard
                  key={image.id}
                  image={image}
                  deleting={deletingImage === image.id}
                  onDelete={handleDeleteImage}
                />
              ))
            )}
          </section>
        )}

        {activeTab === 'reviews' && (
          <section className="results-review-stack">
            {submissions.length === 0 ? (
              <div className="results-empty">No reviews yet.</div>
            ) : (
              <>
                <div className="reviewer-chip-list">
                  {submissions.map((submission, index) => {
                    const likes = (submission.decisions || []).filter((item) => item.liked).length;
                    const dislikes = (submission.decisions || []).filter((item) => !item.liked).length;
                    const active = selectedReviewer === index;
                    return (
                      <button
                        key={submission.id || `${submission.reviewerName}-${index}`}
                        type="button"
                        className={`reviewer-chip${active ? ' reviewer-chip-active' : ''}`}
                        onClick={() => setSelectedReviewer(active ? null : index)}
                      >
                        <span>{normalizeText(submission.reviewerName, 'Reviewer')}</span>
                        <span className="reviewer-chip-metrics">
                          <span className="metric-chip metric-chip-like">{likes}</span>
                          <span className="metric-chip metric-chip-dislike">{dislikes}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {visibleSubmissions.map((submission, visibleIndex) => {
                  const reviewerName = normalizeText(submission.reviewerName, 'Reviewer');
                  const reviewerEmail = normalizeText(submission.reviewerEmail, '');
                  const subAnnotations = [];

                  images.forEach((image) => {
                    (image.annotations || [])
                      .filter((annotation) => {
                        const author = normalizeText(annotation.reviewer || annotation.author, '');
                        const email = normalizeText(annotation.reviewerEmail || annotation.email, '');
                        if (reviewerEmail && email) return email.toLowerCase() === reviewerEmail.toLowerCase();
                        return author === reviewerName;
                      })
                      .forEach((annotation) => subAnnotations.push({ ...annotation, image }));
                  });

                  return (submission.decisions || []).map((decision, index) => {
                    const image = images.find((item) => item.id === decision.imageId);
                    const previewUrl = image?.url || image?.signedUrl || '';
                    const comments = subAnnotations.filter((item) => item.imageId === decision.imageId);
                    const likeCount = decision.liked ? 1 : 0;
                    const dislikeCount = decision.liked ? 0 : 1;
                    const isVideo = isVideoAsset(image);

                    return (
                      <article key={`${submission.id || visibleIndex}-${decision.imageId}-${index}`} className="reviewer-card">
                        <div className="reviewer-card-header">
                          <div>
                            <div className="reviewer-name-title">{reviewerName}</div>
                            <div className="results-review-time">{formatDateTime(submission.submittedAt)}</div>
                          </div>
                          <div className="results-summary-counts">
                            <span className="metric-chip metric-chip-like">{likeCount}</span>
                            <span className="metric-chip metric-chip-dislike">{dislikeCount}</span>
                            <span>{comments.length} comments</span>
                          </div>
                        </div>

                        <div className="history-list-panel">
                          <div className="history-comment-card">
                            <div className="history-card">
                              <div className="history-card-main">
                                {!isVideo && (
                                  <div className="history-thumb">
                                    {previewUrl ? (
                                      <img src={previewUrl} alt={image?.fileName || 'Asset'} />
                                    ) : (
                                      <span className="history-thumb-fallback">No preview</span>
                                    )}
                                  </div>
                                )}

                                <div className="history-card-copy">
                                  <div className="history-card-title">
                                    {normalizeText(image?.fileName, `Asset ${index + 1}`)}
                                  </div>
                                  <div className="history-card-meta">
                                    {image?.rowOrder ? `Post ${image.rowOrder}` : getAssetTypeLabel(image)}
                                  </div>
                                  <div className="history-card-meta">
                                    {decision.liked ? 'Approved' : 'Rejected'}
                                  </div>
                                </div>
                              </div>

                              <div className="history-card-side">
                                <span className={`history-status ${decision.liked ? 'history-status-like' : 'history-status-dislike'}`}>
                                  {decision.liked ? 'Approved' : 'Rejected'}
                                </span>
                                <button
                                  type="button"
                                  className="history-view-btn"
                                  onClick={() => openAsset(previewUrl)}
                                  disabled={!previewUrl}
                                >
                                  View
                                </button>
                              </div>
                            </div>

                            {comments.length > 0 && previewUrl && isVideo && (
                              <div className="video-review-thread">
                                <VideoCommentPanel image={image} comments={comments} />
                              </div>
                            )}

                            {comments.length > 0 && (
                              <div className="history-comment-list">
                                {comments.map((comment, commentIndex) => (
                                  <div key={`${decision.imageId}-comment-${commentIndex}`} className="history-comment-item">
                                    <div className="history-comment-index">{commentIndex + 1}</div>
                                    <div className="history-comment-copy">
                                      <div>{normalizeText(comment.comment, 'No comment')}</div>
                                      <div className="history-card-meta">
                                        {comment.timestampSec != null ? (
                                          <span className="timestamp-comment-inline">
                                            {formatTimestamp(comment.timestampSec)}
                                          </span>
                                        ) : (
                                          `Pin at x:${Math.round(Number(comment.x) || 0)} y:${Math.round(Number(comment.y) || 0)}`
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {comments.length > 0 && previewUrl && !isVideo && (
                              <div className="annotation-panel">
                                <AnnotationView annotations={comments} imageUrl={previewUrl} />
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  });
                })}
              </>
            )}
          </section>
        )}
      </div>

      {showDelete && (
        <div className="confirm-overlay" onClick={() => setShowDelete(false)}>
          <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h3 className="confirm-title">Delete current review?</h3>
            <p className="confirm-copy">
              This removes the current uploaded review set and all of its assets and comments.
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowDelete(false)}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
