import React, { useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';

/**
 * VideoPlayer — custom HTML5 video player with:
 * - Play / pause toggle
 * - Scrub bar synced to currentTime
 * - Timestamp display (MM:SS)
 * - Mute toggle
 * - Exposes pause/play/seek controls via forwardRef
 */
const VideoPlayer = React.forwardRef(function VideoPlayer(
  { src, onTimeUpdate, style, className },
  ref
) {
  const videoRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [ready, setReady] = useState(false);

  const formatTime = (secs) => {
    const s = Math.floor(secs || 0);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    if (!scrubbing) setCurrentTime(t);
    if (onTimeUpdate) onTimeUpdate(t);
  }, [scrubbing, onTimeUpdate]);

  const applySeek = useCallback((secs, options = {}) => {
    if (!videoRef.current) return;
    const safeDuration = videoRef.current.duration || duration || Number.MAX_SAFE_INTEGER;
    const nextTime = Math.min(
      safeDuration,
      Math.max(0, Number(secs) || 0)
    );
    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
    if (options.play) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [duration]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
    setReady(true);
    if (pendingSeekRef.current) {
      const pending = pendingSeekRef.current;
      pendingSeekRef.current = null;
      applySeek(pending.secs, pending.options);
    }
  };

  const handleSeeked = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    if (onTimeUpdate) onTimeUpdate(t);
  };

  const handlePlay = () => setPlaying(true);
  const handlePause = () => setPlaying(false);
  const handleEnded = () => setPlaying(false);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) videoRef.current.play();
    else videoRef.current.pause();
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setMuted(videoRef.current.muted);
  };

  const handleScrubChange = (e) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) videoRef.current.currentTime = val;
  };

  const seekBy = useCallback((delta) => {
    const baseTime = videoRef.current?.currentTime ?? currentTime;
    applySeek(baseTime + delta, { play: playing });
  }, [applySeek, currentTime, playing]);

  useEffect(() => {
    pendingSeekRef.current = null;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setReady(false);
  }, [src]);

  useImperativeHandle(ref, () => ({
    play: async () => {
      if (!videoRef.current) return;
      await videoRef.current.play();
    },
    pause: () => {
      if (!videoRef.current) return;
      videoRef.current.pause();
    },
    seekTo: (secs, options = {}) => {
      if (!videoRef.current) return;
      if (!ready) {
        pendingSeekRef.current = { secs, options };
        videoRef.current.load();
        return;
      }
      applySeek(secs, options);
    },
    seekBy,
    getCurrentTime: () => videoRef.current?.currentTime || 0,
    isReady: () => ready,
    getElement: () => videoRef.current,
  }), [applySeek, ready, seekBy]);

  return (
    <div
      className={`video-player-shell${className ? ` ${className}` : ''}`}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        background: '#000', borderRadius: 12, overflow: 'hidden', height: '100%',
        ...style,
      }}
    >
      {/* The actual video element */}
      <video
        ref={videoRef}
        src={src}
        playsInline
        muted={muted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={handleSeeked}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        preload="metadata"
        className="video-player-media"
        style={{ flex: 1, minHeight: 0, width: '100%', display: 'block', cursor: 'pointer', objectFit: 'contain' }}
        onClick={togglePlay}
      />

      {/* Controls overlay */}
      <div 
        className="video-player-controls"
        style={{ flexDirection: 'column', alignItems: 'stretch', padding: '12px 16px' }}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Scrub bar - Dedicated Row 1 */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleScrubChange}
          onMouseDown={() => setScrubbing(true)}
          onMouseUp={() => setScrubbing(false)}
          onTouchStart={() => setScrubbing(true)}
          onTouchEnd={() => setScrubbing(false)}
          className="video-player-range"
          aria-label="Video seek"
          style={{ width: '100%', margin: '2px 0 12px 0' }}
        />

        {/* Buttons - Dedicated Row 2 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              id="video-play-pause"
              onClick={togglePlay}
              className="video-player-icon-btn video-player-icon-btn-primary"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                  <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => seekBy(-5)}
              className="video-player-seek-btn"
              aria-label="Back 5 seconds"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 3v5h5" />
                <path d="M11 10l-2 2 2 2" />
                <path d="M15 10l-2 2 2 2" />
              </svg>
            </button>

            <span className="video-player-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              id="video-mute-toggle"
              onClick={toggleMute}
              className="video-player-icon-btn"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round">
                  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" /><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => seekBy(5)}
              className="video-player-seek-btn"
              aria-label="Forward 5 seconds"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v5h-5" />
                <path d="M9 10l2 2-2 2" />
                <path d="M13 10l2 2-2 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default VideoPlayer;
