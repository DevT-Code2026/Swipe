import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import SwipeCard from '../components/SwipeCard';
import ZoomableImage from '../components/ZoomableImage';
import VideoPlayer from '../components/VideoPlayer';

function isVideoAsset(asset) {
  const source = String(asset?.contentType || asset?.fileName || '').toLowerCase();
  return source.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(source);
}

function formatTimestamp(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function SocialIcon({ type, className = '' }) {
  switch (type) {
    case 'heart':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
        </svg>
      );
    case 'comment':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v4A3.5 3.5 0 0 1 15.5 14H11l-4 4v-4.4A3.5 3.5 0 0 1 5 10.5Z" />
        </svg>
      );
    case 'share':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m14 4 6 6-6 6" />
          <path d="M20 10H9a5 5 0 0 0-5 5v1" />
        </svg>
      );
    case 'bookmark':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4h10v16l-5-3-5 3Z" />
        </svg>
      );
    case 'thumbs-up':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 21H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
          <path d="M11 10V5a2 2 0 0 1 2-2l1 6h4a2 2 0 0 1 2 2l-1 6a2 2 0 0 1-2 2H7V10Z" />
        </svg>
      );
    case 'thumbs-down':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3" />
          <path d="M11 14v5a2 2 0 0 0 2 2l1-6h4a2 2 0 0 0 2-2l-1-6a2 2 0 0 0-2-2H7v9Z" />
        </svg>
      );
    case 'send':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 3 10 14" />
          <path d="m21 3-7 18-4-7-7-4Z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function ReviewerSwipe() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState([]);
  const [annotations, setAnnotations] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pinMode, setPinMode] = useState(false);
  const [showPinModeTip, setShowPinModeTip] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState({ loaded: 0, total: 0 });
  const [gestureLocked, setGestureLocked] = useState(false);
  const [videoTimestamp, setVideoTimestamp] = useState(0);
  const [showVideoComment, setShowVideoComment] = useState(false);
  const [videoCommentText, setVideoCommentText] = useState('');
  const [activeAnnotationIndex, setActiveAnnotationIndex] = useState(null);
  const [activeVideoTimestamp, setActiveVideoTimestamp] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    setShowPinModeTip(pinMode);
  }, [pinMode]);

  useEffect(() => {
    if (!showVideoComment || !videoRef.current?.pause) return;
    videoRef.current.pause();
  }, [showVideoComment]);

  useEffect(() => {
    let cancelled = false;

    const preloadMedia = async (items) => {
      if (!items.length) return;

      setPreloadProgress({ loaded: 0, total: items.length });

      const markLoaded = () => {
        if (cancelled) return;
        setPreloadProgress((prev) => ({
          ...prev,
          loaded: Math.min(prev.loaded + 1, prev.total),
        }));
      };

      await Promise.all(
        items.map(
          (item) =>
            new Promise((resolve) => {
              const mediaUrl = item.url || item.signedUrl;
              if (!mediaUrl) {
                markLoaded();
                resolve();
                return;
              }

              if (isVideoAsset(item)) {
                markLoaded();
                resolve();
                return;
              }

              const image = new Image();
              let handled = false;
              const complete = () => {
                if (handled) return;
                handled = true;
                markLoaded();
                resolve();
              };
              
              image.decoding = 'async';
              image.loading = 'eager';
              image.onload = complete;
              image.onerror = complete;
              image.src = mediaUrl;
              
              setTimeout(complete, 3000);
            })
        )
      );
    };

    api
      .getSessionImages(sessionId, true)
      .then(async (data) => {
        const sorted = [...(data.images || [])].sort((a, b) => {
          const rowA = Number(a.rowOrder) || Number.MAX_SAFE_INTEGER;
          const rowB = Number(b.rowOrder) || Number.MAX_SAFE_INTEGER;
          if (rowA !== rowB) return rowA - rowB;
          const orderA = Number(a.order) || 0;
          const orderB = Number(b.order) || 0;
          return orderA - orderB;
        });

        const unique = sorted.filter((image, index, list) => {
          const key = image.id || `${image.fileName || ''}-${image.rowOrder || ''}-${image.order || ''}`;
          return (
            list.findIndex((candidate) => {
              const candidateKey = candidate.id || `${candidate.fileName || ''}-${candidate.rowOrder || ''}-${candidate.order || ''}`;
              return candidateKey === key;
            }) === index
          );
        });

        await preloadMedia(unique);
        if (!cancelled) setImages(unique);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load review assets');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const currentImage = images[currentIndex];
  const currentAnnotations = useMemo(
    () => (currentImage ? annotations[currentImage.id] || [] : []),
    [annotations, currentImage]
  );
  const currentVideoComments = useMemo(
    () =>
      currentAnnotations
        .filter((item) => item.timestampSec != null)
        .sort((left, right) => Number(left.timestampSec || 0) - Number(right.timestampSec || 0)),
    [currentAnnotations]
  );
  const currentImageComments = useMemo(
    () => currentAnnotations.filter((item) => item.timestampSec == null),
    [currentAnnotations]
  );
  const postOrderList = useMemo(() => {
    const orders = new Set();
    images.forEach((image) => {
      orders.add(Number(image.rowOrder) || 1);
    });
    return Array.from(orders).sort((a, b) => a - b);
  }, [images]);
  const currentPostOrder = Number(currentImage?.rowOrder) || 1;
  const currentPostIndex = Math.max(0, postOrderList.findIndex((post) => post === currentPostOrder));
  const isComplete = currentIndex >= images.length && images.length > 0;
  const progress = images.length > 0 ? (currentIndex / images.length) * 100 : 0;

  useEffect(() => {
    setShowVideoComment(false);
    setVideoCommentText('');
    setActiveAnnotationIndex(null);
    setActiveVideoTimestamp(null);
  }, [currentImage?.id]);

  const upsertDecision = useCallback((imageId, liked) => {
    setDecisions((prev) => {
      const next = prev.filter((item) => item.imageId !== imageId);
      return [...next, { imageId, liked }];
    });
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= images.length - 1) return images.length;
      return prev + 1;
    });
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleDecision = useCallback(
    (liked) => {
      if (!currentImage) return;
      upsertDecision(currentImage.id, liked);
      goNext();
    },
    [currentImage, goNext, upsertDecision]
  );

  const handleAnnotation = useCallback(
    (pin) => {
      if (!currentImage) return;
      const reviewerName = sessionStorage.getItem('reviewerName') || '';
      setAnnotations((prev) => ({
        ...prev,
        [currentImage.id]: [
          ...(prev[currentImage.id] || []),
          {
            ...pin,
            author: pin.author || reviewerName,
            createdAt: pin.createdAt || new Date().toISOString(),
          },
        ],
      }));
    },
    [currentImage]
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const allAnnotations = Object.entries(annotations).flatMap(([imageId, pins]) =>
        pins.map((pin) => ({ imageId, ...pin }))
      );
      await api.submitReview(sessionId, decisions, allAnnotations);
      navigate(`/r/${sessionId}/complete`, {
        state: {
          totalImages: images.length,
          liked: decisions.filter((decision) => decision.liked).length,
          disliked: decisions.filter((decision) => !decision.liked).length,
          annotationCount: allAnnotations.length,
        },
      });
    } catch (err) {
      setError(err.message || 'Failed to submit review');
      setSubmitting(false);
    }
  };

  const renderMedia = (image) => {
    const mediaUrl = image.url || image.signedUrl;
    if (isVideoAsset(image)) {
      return (
        <VideoPlayer
          ref={videoRef}
          src={mediaUrl}
          onTimeUpdate={setVideoTimestamp}
          style={{ borderRadius: 12, overflow: 'hidden' }}
        />
      );
    }
    return <ZoomableImage src={mediaUrl} alt={image.fileName || 'Creative'} onZoomStateChange={setGestureLocked} />;
  };

  const renderTemplateCard = (image) => {
    if (!image) return null;
    const channel = String(image.templateChannel || '').toLowerCase();
    const text = image.templateText || '';
    const resolvedClientName = image.clientName || 'Client';
    const resolvedProjectName = image.projectName || 'Project';

    if (channel.includes('instagram')) {
      return (
        <div className="platform-card ig-card reviewer-platform-card">
          <div className="ig-top">
            <div className="ig-avatar" />
            <div>
              <div className="ig-name">{resolvedProjectName}</div>
              <div className="ig-meta">{resolvedClientName} • just now</div>
            </div>
          </div>
          <div className="ig-media">{renderMedia(image)}</div>
          <div className="ig-bottom">
            <div className="ig-actions ig-actions-real">
              <span className="ig-action-icon"><SocialIcon type="heart" className="social-action-svg" /></span>
              <span className="ig-action-icon"><SocialIcon type="comment" className="social-action-svg" /></span>
              <span className="ig-action-icon"><SocialIcon type="share" className="social-action-svg" /></span>
              <span className="ig-action-icon" style={{ marginLeft: 'auto' }}><SocialIcon type="bookmark" className="social-action-svg" /></span>
            </div>
            <div className="ig-caption">{text || 'No caption provided.'}</div>
          </div>
        </div>
      );
    }

    if (channel.includes('linkedin')) {
      return (
        <div className="platform-card li-card reviewer-platform-card">
          <div className="li-top">
            <div className="li-avatar" />
            <div>
              <div className="li-company">{resolvedClientName}</div>
              <div className="li-meta">{resolvedProjectName} • just now</div>
            </div>
          </div>
          <div className="li-copy">{text || 'No post text provided.'}</div>
          <div className="li-media">{renderMedia(image)}</div>
          <div className="li-actions">
            <span className="li-action-button"><span className="li-action-glyph"><SocialIcon type="thumbs-up" className="social-action-svg social-action-svg-sm" /></span>Like</span>
            <span className="li-action-button"><span className="li-action-glyph"><SocialIcon type="comment" className="social-action-svg social-action-svg-sm" /></span>Comment</span>
            <span className="li-action-button"><span className="li-action-glyph"><SocialIcon type="share" className="social-action-svg social-action-svg-sm" /></span>Share</span>
            <span className="li-action-button"><span className="li-action-glyph"><SocialIcon type="send" className="social-action-svg social-action-svg-sm" /></span>Send</span>
          </div>
        </div>
      );
    }

    return (
      <div className="platform-card yt-card reviewer-platform-card">
        <div className="yt-media">{renderMedia(image)}</div>
      </div>
    );
  };

  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  if (loading) {
    const percent = preloadProgress.total > 0
      ? Math.round((preloadProgress.loaded / preloadProgress.total) * 100)
      : 0;

    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div style={{ color: 'var(--sub)', fontSize: 15 }}>Loading media...</div>
        <div style={{ color: 'var(--sub)', fontSize: 13 }}>
          {preloadProgress.total > 0
            ? `${preloadProgress.loaded}/${preloadProgress.total} (${percent}%)`
            : 'Preparing session...'}
        </div>
      </div>
    );
  }

  if (error && images.length === 0) {
    return (
      <div className="app-shell no-scroll" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--sub)' }}>Review unavailable</div>
        <div className="error-box">{error}</div>
      </div>
    );
  }

  if (isComplete) {
    const liked = decisions.filter((decision) => decision.liked).length;
    const disliked = decisions.filter((decision) => !decision.liked).length;

    return (
      <div className="app-shell no-scroll">
        <div className="complete-screen">
          <div className="complete-icon-badge anim-pop" aria-hidden="true">
            <span className="complete-icon-glyph" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800 }}>All Done</h2>
          <p style={{ color: 'var(--sub)', fontSize: 15, lineHeight: 1.5, maxWidth: 300 }}>
            You reviewed {images.length} image{images.length !== 1 ? 's' : ''}.
          </p>

          <div style={{ display: 'flex', gap: 16 }}>
            <div className="stat-card" style={{ padding: '18px 24px' }}>
              <div className="num" style={{ color: 'var(--like)' }}>{liked}</div>
              <div className="label">Approved</div>
            </div>
            <div className="stat-card" style={{ padding: '18px 24px' }}>
              <div className="num" style={{ color: 'var(--dislike)' }}>{disliked}</div>
              <div className="label">Rejected</div>
            </div>
          </div>

          {error && <div className="error-box" style={{ width: '100%', maxWidth: 400 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 400 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setCurrentIndex(0);
                setDecisions([]);
                setAnnotations({});
              }}
              style={{ flex: 1 }}
            >
              Redo
            </button>
            <button
              type="button"
              className="btn-accent"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ flex: 2 }}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell no-scroll">
      <div className="header-bar" style={{ padding: '16px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="logo" style={{ fontSize: 18 }}>
            Creative<span>Swipe</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: 'var(--sub)', fontWeight: 500 }}>
            Post {currentPostIndex + 1} / {postOrderList.length || 1}
          </span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate(`/r/${sessionId}`)}
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            Exit
          </button>
        </div>
      </div>

      <div style={{ padding: '0 20px 8px', flexShrink: 0 }}>
        <div className="progress-bar">
          <div
            className="progress-fill progress-fill-glow"
            style={{ width: `${progress}%`, background: 'var(--accent)', color: 'var(--accent)' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', padding: '8px 20px 0', overflow: 'hidden' }}>
        {pinMode && showPinModeTip && (
          <div className="pin-mode-tip">
            <div className="pin-mode-tip-inner">
              <div className="pin-mode-dot" />
              Tap on the image to post a comment
            </div>
          </div>
        )}

        {currentImage && (
          <SwipeCard
            key={currentIndex}
            imageUrl={currentImage.url || currentImage.signedUrl}
            alt={currentImage.fileName || `Image ${currentIndex + 1}`}
            cardContent={renderTemplateCard(currentImage)}
            onDecision={handleDecision}
            onAnnotationAdd={handleAnnotation}
            annotations={currentAnnotations}
            pinMode={pinMode}
            gestureLocked={gestureLocked}
            disabled={showVideoComment}
            activeAnnotationIndex={activeAnnotationIndex}
            onPinModeTouchStart={() => setShowPinModeTip(false)}
            onPinModeUsed={() => setPinMode(false)}
          />
        )}
      </div>

      <div className="reviewer-comment-helper">
        {isVideoAsset(currentImage) ? (
          <button
            type="button"
            className="reviewer-comment-pill"
            id="video-add-timestamp-comment"
            onClick={() => {
              videoRef.current?.pause?.();
              const ts = videoRef.current?.getCurrentTime?.() ?? videoTimestamp;
              setVideoTimestamp(ts);
              setVideoCommentText('');
              setShowVideoComment(true);
              setActiveVideoTimestamp(ts);
            }}
          >
            <span className="reviewer-comment-pill-icon"><SocialIcon type="comment" className="social-action-svg social-action-svg-sm" /></span>
            Add comment at {formatTimestamp(videoTimestamp)}
          </button>
        ) : (
          <button
            type="button"
            className={`reviewer-comment-pill ${pinMode ? 'reviewer-comment-pill-active' : ''}`}
            onClick={() => setPinMode(!pinMode)}
          >
            <span className="reviewer-comment-pill-icon"><SocialIcon type="comment" className="social-action-svg social-action-svg-sm" /></span>
            {pinMode ? 'Tap image to add comment' : 'Add comment'}
          </button>
        )}
      </div>

      {/* Video timestamp comment modal */}
      {false && showVideoComment && (
        <div className="confirm-overlay" onClick={() => setShowVideoComment(false)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: 'var(--accent)', color: '#fff',
              }}>
                ⏱ {(() => { const s = Math.floor(videoTimestamp); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; })()}
              </span>
              <span style={{ fontSize: 13, color: 'var(--sub)' }}>Timestamp comment</span>
            </div>
            <textarea
              id="video-comment-input"
              autoFocus
              className="field"
              rows={3}
              placeholder="Add your comment here…"
              value={videoCommentText}
              onChange={e => setVideoCommentText(e.target.value)}
              style={{ resize: 'none', width: '100%' }}
            />
            <div className="confirm-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn-secondary" onClick={() => setShowVideoComment(false)}>Cancel</button>
              <button
                type="button"
                className="btn-accent"
                disabled={!videoCommentText.trim()}
                onClick={() => {
                  if (!videoCommentText.trim()) return;
                  handleAnnotation({ timestampSec: videoTimestamp, comment: videoCommentText.trim() });
                  setVideoCommentText('');
                  setShowVideoComment(false);
                }}
              >
                Post Comment
              </button>
            </div>
          </div>
        </div>
      )}

      {isVideoAsset(currentImage) && currentVideoComments.length > 0 && (
        <div className="reviewer-comment-thread">
          <div className="reviewer-comment-thread-title">Comments</div>
          <div className="timestamp-comment-list reviewer-timestamp-comment-list">
            {currentVideoComments.map((item, index) => {
              const isActive = activeVideoTimestamp != null && item.timestampSec === activeVideoTimestamp;
              return (
                <button
                  key={`reviewer-video-comment-${index}`}
                  type="button"
                  className={`timestamp-comment-card timestamp-comment-button${isActive ? ' timestamp-comment-button-active' : ''}`}
                  onClick={() => {
                    videoRef.current?.seekTo?.(item.timestampSec);
                    videoRef.current?.pause?.();
                    setActiveVideoTimestamp(item.timestampSec);
                  }}
                >
                  <span className="timestamp-comment-badge">{formatTimestamp(item.timestampSec)}</span>
                  <span className="timestamp-comment-copy">{item.comment || 'No comment'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isVideoAsset(currentImage) && currentImageComments.length > 0 && (
        <div className="reviewer-comment-thread">
          <div className="reviewer-comment-thread-title">Comments</div>
          <div className="timestamp-comment-list reviewer-timestamp-comment-list">
            {currentImageComments.map((item, index) => {
              const isActive = activeAnnotationIndex === index;
              return (
                <button
                  key={`reviewer-image-comment-${index}`}
                  type="button"
                  className={`timestamp-comment-card timestamp-comment-button${isActive ? ' timestamp-comment-button-active' : ''}`}
                  onClick={() => setActiveAnnotationIndex(index)}
                >
                  <span className="timestamp-comment-badge">{index + 1}</span>
                  <span className="timestamp-comment-copy">{item.comment || 'No comment'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showVideoComment && (
        <div className="reviewer-comment-composer">
          <div className="reviewer-comment-composer-top">
            <span className="timestamp-comment-badge reviewer-comment-timestamp">{formatTimestamp(videoTimestamp)}</span>
            <span className="reviewer-comment-composer-label">Timestamp comment</span>
          </div>
          <textarea
            id="video-comment-input"
            autoFocus
            className="field reviewer-comment-textarea"
            rows={3}
            placeholder="Add your comment here..."
            value={videoCommentText}
            onChange={e => setVideoCommentText(e.target.value)}
          />
          <div className="reviewer-comment-composer-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowVideoComment(false)}>Cancel</button>
            <button
              type="button"
              className="btn-accent"
              disabled={!videoCommentText.trim()}
              onClick={() => {
                if (!videoCommentText.trim()) return;
                handleAnnotation({ timestampSec: videoTimestamp, comment: videoCommentText.trim() });
                setActiveVideoTimestamp(videoTimestamp);
                setVideoCommentText('');
                setShowVideoComment(false);
              }}
            >
              Post Comment
            </button>
          </div>
        </div>
      )}

      <div className="action-bar safe-pb reviewer-swipe-actions" style={{ padding: '8px 20px 20px' }}>
        <button
          type="button"
          className="action-btn btn-undo"
          onClick={goPrev}
          disabled={currentIndex === 0}
          style={{ opacity: currentIndex === 0 ? 0.3 : 1 }}
          aria-label="Undo" />

        <button
          type="button"
          className="action-btn btn-dislike"
          onClick={() => handleDecision(false)}
          aria-label="Reject" />

        <button
          type="button"
          className="action-btn btn-like"
          onClick={() => handleDecision(true)}
          aria-label="Approve" />
      </div>
    </div>
  );
}


