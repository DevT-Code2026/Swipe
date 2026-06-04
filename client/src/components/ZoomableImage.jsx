import React, { useEffect, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function ZoomableImage({ src, alt, className = '', onZoomStateChange }) {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 }); // percentage-based origin
  const containerRef = useRef(null);
  const pinchRef = useRef({
    active: false,
    startDistance: 0,
    startScale: 1,
  });

  useEffect(() => {
    onZoomStateChange?.(pinchRef.current.active || scale > 1);
  }, [scale, onZoomStateChange]);

  useEffect(() => () => onZoomStateChange?.(false), [onZoomStateChange]);

  const getDistance = (touches) => {
    const [a, b] = touches;
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  };

  // Returns the pinch midpoint as % of the container dimensions.
  const getMidpointOrigin = (touches) => {
    const [a, b] = touches;
    const midX = (a.clientX + b.clientX) / 2;
    const midY = (a.clientY + b.clientY) / 2;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: clamp(((midX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((midY - rect.top) / rect.height) * 100, 0, 100),
    };
  };

  const handleTouchStart = (event) => {
    if (event.touches.length === 2) {
      const mid = getMidpointOrigin(event.touches);
      setOrigin(mid);
      pinchRef.current = {
        active: true,
        startDistance: getDistance(event.touches),
        startScale: scale,
      };
      onZoomStateChange?.(true);
    }
  };

  const handleTouchMove = (event) => {
    if (!pinchRef.current.active || event.touches.length !== 2) return;
    const distance = getDistance(event.touches);
    const ratio = distance / (pinchRef.current.startDistance || distance);
    const nextScale = clamp(pinchRef.current.startScale * ratio, 1, 3);
    setScale(nextScale);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleTouchEnd = (event) => {
    if (event.touches.length < 2) {
      pinchRef.current.active = false;
      setScale(1);
      setOrigin({ x: 50, y: 50 }); // reset origin back to center
      onZoomStateChange?.(false);
    }
  };

  const resetZoom = (event) => {
    event.stopPropagation();
    setScale(1);
    setOrigin({ x: 50, y: 50 });
    onZoomStateChange?.(false);
  };

  return (
    <div
      ref={containerRef}
      className="zoomable-media"
      onDoubleClick={resetZoom}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={(event) => {
        if (scale > 1) {
          event.stopPropagation();
        }
      }}
      onPointerMove={(event) => {
        if (scale > 1) {
          event.stopPropagation();
        }
      }}
      onPointerUp={(event) => {
        if (scale > 1) {
          event.stopPropagation();
        }
      }}
      title={scale > 1 ? 'Double-tap to reset zoom' : 'Pinch to zoom'}
    >
      <img
        src={src}
        alt={alt}
        className={className}
        draggable={false}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${origin.x}% ${origin.y}%`,
          transition: scale === 1 ? 'transform 0.2s ease' : 'none',
        }}
      />
    </div>
  );
}
