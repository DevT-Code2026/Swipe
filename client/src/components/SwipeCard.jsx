import React, { useRef, useState, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';

const DRAG_THRESHOLD = 110;
const FLING_VELOCITY = 0.5;

const PIN_COLORS = [
  '#e8ff47', '#3dff8f', '#ff4d6d', '#a78bfa',
  '#f59e0b', '#22d3ee', '#fb7185',
];

export default function SwipeCard({
  imageUrl,
  alt = '',
  cardContent = null,
  onDecision,
  onNavigate,
  onAnnotationAdd,
  annotations = [],
  disabled = false,
  pinMode = false,
  onPinModeUsed,
  onPinModeTouchStart,
  navigationMode = false,
  gestureLocked = false,
  activeAnnotationIndex = null,
}) {
  const cardRef = useRef(null);
  const nameInputRef = useRef(null);
  const commentInputRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0, time: 0 });
  const activePointersRef = useRef(new Set());
  const multiTouchRef = useRef(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showAnnotationInput, setShowAnnotationInput] = useState(null);
  const [annotationComment, setAnnotationComment] = useState('');
  const [annotationName, setAnnotationName] = useState(
    sessionStorage.getItem('reviewerName') || ''
  );
  const [pinStep, setPinStep] = useState('name');
  const [flash, setFlash] = useState(null);

  const absX = Math.abs(offset.x);
  const progress = Math.min(absX / DRAG_THRESHOLD, 1);
  const rotation = (offset.x / 15) * (1 - Math.abs(offset.y) / 600);

  const resetDragState = useCallback(() => {
    setIsDragging(false);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Opens the annotation dialog and immediately focuses the right input.
  const openAnnotationDialog = useCallback(
    (clientX, clientY) => {
      if (!onAnnotationAdd || !cardRef.current) return;
      onPinModeTouchStart?.();
      const rect = cardRef.current.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      const step = annotationName ? 'comment' : 'name';

      // flushSync forces React to paint synchronously so the DOM node exists
      // before we call .focus(), giving us auto-keyboard popup on mobile.
      flushSync(() => {
        setShowAnnotationInput({ x, y });
        setPinStep(step);
        setAnnotationComment('');
      });

      const target = step === 'comment' ? commentInputRef.current : nameInputRef.current;
      if (target) {
        target.focus({ preventScroll: false });
        try {
          const v = target.value || '';
          if (typeof target.setSelectionRange === 'function') {
            target.setSelectionRange(v.length, v.length);
          }
        } catch (_) {}
      }
    },
    [onAnnotationAdd, onPinModeTouchStart, annotationName]
  );

  const handlePointerDown = useCallback(
    (e) => {
      if (disabled || isAnimating || showAnnotationInput || gestureLocked) return;

      if (e.pointerType === 'touch') {
        activePointersRef.current.add(e.pointerId);
        if (activePointersRef.current.size > 1) {
          multiTouchRef.current = true;
          resetDragState();
          return;
        }
      }

      if (pinMode && onAnnotationAdd) {
        openAnnotationDialog(e.clientX, e.clientY);
        return;
      }

      setIsDragging(true);
      startRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    },
    [disabled, isAnimating, showAnnotationInput, gestureLocked, pinMode, onAnnotationAdd, resetDragState, openAnnotationDialog]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDragging || gestureLocked || multiTouchRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      setOffset({ x: dx, y: dy });
    },
    [gestureLocked, isDragging]
  );

  const fling = useCallback(
    (moveRight) => {
      setIsAnimating(true);
      const dir = moveRight ? 1 : -1;
      setFlash(navigationMode ? 'nav' : moveRight ? 'like' : 'dislike');
      setOffset({ x: dir * window.innerWidth * 1.5, y: 0 });

      setTimeout(() => {
        setFlash(null);
        setOffset({ x: 0, y: 0 });
        setIsAnimating(false);
        if (navigationMode) {
          onNavigate?.(moveRight ? 'prev' : 'next');
        } else {
          onDecision?.(moveRight);
        }
      }, 400);
    },
    [navigationMode, onDecision, onNavigate]
  );

  const clearPointer = useCallback((pointerId) => {
    activePointersRef.current.delete(pointerId);
    if (activePointersRef.current.size < 2) {
      multiTouchRef.current = false;
    }
  }, []);

  const handlePointerUp = useCallback(
    (e) => {
      if (e.pointerType === 'touch') clearPointer(e.pointerId);

      if (!isDragging) return;
      if (gestureLocked || multiTouchRef.current) {
        resetDragState();
        return;
      }
      setIsDragging(false);

      const dt = Date.now() - startRef.current.time;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      const velocity = Math.abs(dx) / dt;

      if (Math.abs(dx) < 5 && Math.abs(dy) < 5 && dt < 300) {
        if (pinMode && onAnnotationAdd) {
          openAnnotationDialog(e.clientX, e.clientY);
        }
        return;
      }

      if (velocity > FLING_VELOCITY || absX > DRAG_THRESHOLD) {
        fling(dx > 0);
      } else {
        setOffset({ x: 0, y: 0 });
      }
    },
    [isDragging, gestureLocked, absX, fling, pinMode, onAnnotationAdd, resetDragState, clearPointer, openAnnotationDialog]
  );

  const handlePointerCancel = useCallback(
    (e) => {
      if (e?.pointerType === 'touch') clearPointer(e.pointerId);
      multiTouchRef.current = false;
      resetDragState();
    },
    [resetDragState, clearPointer]
  );

  useEffect(() => {
    if (isDragging) {
      const move = (e) => handlePointerMove(e);
      const up = (e) => handlePointerUp(e);
      const cancel = (e) => handlePointerCancel(e);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      return () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp, handlePointerCancel]);

  useEffect(() => {
    if (gestureLocked) {
      // Zoom started — reset any in-progress drag
      if (isDragging || offset.x !== 0 || offset.y !== 0) resetDragState();
    } else {
      // Zoom ended — clear stale pointer IDs so the next swipe isn't
      // mistakenly treated as a multi-touch gesture.
      activePointersRef.current.clear();
      multiTouchRef.current = false;
    }
  }, [gestureLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnnotationSubmit = () => {
    if (pinStep === 'name') {
      if (!annotationName.trim()) return;
      sessionStorage.setItem('reviewerName', annotationName.trim());

      // Force synchronous render so the textarea is in the DOM before focus.
      flushSync(() => {
        setPinStep('comment');
      });

      if (commentInputRef.current) {
        commentInputRef.current.focus({ preventScroll: false });
      }
      return;
    }

    if (!annotationComment.trim()) return;
    onAnnotationAdd?.({
      x: showAnnotationInput.x,
      y: showAnnotationInput.y,
      comment: annotationComment.trim(),
      author: annotationName.trim(),
    });
    setShowAnnotationInput(null);
    setAnnotationComment('');
    onPinModeUsed?.();
  };

  useEffect(() => {
    if (disabled || isAnimating || showAnnotationInput) return;
    const handler = (e) => {
      if (e.key === 'ArrowRight') {
        if (navigationMode) onNavigate?.('next');
        else fling(true);
      } else if (e.key === 'ArrowLeft') {
        if (navigationMode) onNavigate?.('prev');
        else fling(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, isAnimating, fling, navigationMode, onNavigate, showAnnotationInput]);

  const cardStyle = {
    transform: `translateX(${offset.x}px) translateY(${offset.y * 0.3}px) rotate(${rotation}deg)`,
    transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} className="perspective-1000">
      <div className="ghost-card ghost-card-2" />
      <div className="ghost-card ghost-card-1" />

      <div
        ref={cardRef}
        className="swipe-card"
        style={{ ...cardStyle, cursor: pinMode ? 'crosshair' : undefined }}
        onPointerDown={handlePointerDown}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch') clearPointer(e.pointerId);
        }}
        onPointerCancel={handlePointerCancel}
      >
        {cardContent ? (
          <div className="swipe-card-custom-content">{cardContent}</div>
        ) : (
          <img src={imageUrl} alt={alt} draggable={false} />
        )}

        {!cardContent && <div className="swipe-card-gradient" />}

        {!cardContent && (
          <div className="swipe-card-info">
            <p style={{ fontSize: 12, opacity: 0.7 }}>
              {pinMode ? '💬 Tap to post comment' : navigationMode ? 'Swipe or tap sides to navigate' : 'Swipe to decide'}
            </p>
          </div>
        )}

        {!pinMode && navigationMode && (
          <>
            <button
              type="button"
              className="swipe-tap-zone swipe-tap-zone-left"
              onClick={(e) => {
                e.stopPropagation();
                if (!isAnimating) onNavigate?.('prev');
              }}
              aria-label="Previous image"
            />
            <button
              type="button"
              className="swipe-tap-zone swipe-tap-zone-right"
              onClick={(e) => {
                e.stopPropagation();
                if (!isAnimating) onNavigate?.('next');
              }}
              aria-label="Next image"
            />
          </>
        )}

        {/* Transparent tap layer that captures a single clean tap in pin mode */}
        {pinMode && !showAnnotationInput && (
          <button
            type="button"
            className="pin-capture-layer"
            aria-label="Tap image to add comment"
            onPointerDown={(e) => {
              e.stopPropagation();
              openAnnotationDialog(e.clientX, e.clientY);
            }}
          />
        )}

        {offset.x > 0 && (
          <div
            className="stamp stamp-approve"
            style={{
              transform: `rotate(-15deg) scale(${0.6 + progress * 0.4})`,
              opacity: progress,
            }}
          >
            {navigationMode ? 'PREV' : 'APPROVE'}
          </div>
        )}

        {offset.x < 0 && (
          <div
            className="stamp stamp-reject"
            style={{
              transform: `rotate(15deg) scale(${0.6 + progress * 0.4})`,
              opacity: progress,
            }}
          >
            {navigationMode ? 'NEXT' : 'TRASH'}
          </div>
        )}

        {annotations.map((pin, i) => (
          <div
            key={i}
            className={`pin-marker${activeAnnotationIndex === i ? ' pin-marker-active' : ''}`}
            style={{
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              background: PIN_COLORS[i % PIN_COLORS.length],
            }}
          >
            {i + 1}
          </div>
        ))}

        {showAnnotationInput && (
          <div
            className="pin-sheet-overlay"
            onPointerDown={(e) => {
              // Only close if tapping the dark backdrop, not child elements
              if (e.target === e.currentTarget) {
                e.stopPropagation();
                setShowAnnotationInput(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="pin-marker"
              style={{
                left: `${showAnnotationInput.x}%`,
                top: `${showAnnotationInput.y}%`,
                background: PIN_COLORS[annotations.length % PIN_COLORS.length],
              }}
            >
              {annotations.length + 1}
            </div>

            <div className="pin-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="pin-sheet-handle" />

              {pinStep === 'name' ? (
                <>
                  <label className="field-label">YOUR NAME</label>
                  <input
                    ref={nameInputRef}
                    className="field"
                    placeholder="Enter your name"
                    value={annotationName}
                    onChange={(e) => setAnnotationName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAnnotationSubmit();
                      if (e.key === 'Escape') setShowAnnotationInput(null);
                    }}
                  />
                </>
              ) : (
                <>
                  <label className="field-label">ADD COMMENT</label>
                  <textarea
                    ref={commentInputRef}
                    className="field"
                    placeholder="What should be changed here?"
                    rows={2}
                    value={annotationComment}
                    onChange={(e) => setAnnotationComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAnnotationSubmit();
                      }
                      if (e.key === 'Escape') setShowAnnotationInput(null);
                    }}
                  />
                </>
              )}
              <button className="btn-primary" onClick={handleAnnotationSubmit}>
                {pinStep === 'name' ? 'Next →' : 'Post Comment'}
              </button>
            </div>
          </div>
        )}

        {flash && (
          <div
            className="flash-overlay"
            style={{
              background: flash === 'like'
                ? 'rgba(61,255,143,0.25)'
                : flash === 'dislike'
                  ? 'rgba(255,77,109,0.25)'
                  : 'rgba(255,255,255,0.2)',
            }}
          />
        )}
      </div>
    </div>
  );
}
