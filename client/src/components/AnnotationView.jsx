import React, { useState } from 'react';

const PIN_COLORS = ['#e8ff47', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96f2d7', '#feca57', '#ff9ff3'];

export default function AnnotationView({ annotations = [], imageUrl }) {
  const [activePin, setActivePin] = useState(null);

  if (!annotations.length) return null;

  return (
    <div className="annotation-container">
      <img
        src={imageUrl}
        alt=""
        style={{ width: '100%', display: 'block', borderRadius: 16 }}
      />

      {annotations.map((pin, i) => {
        const color = PIN_COLORS[i % PIN_COLORS.length];
        const isActive = activePin === i;
        return (
          <div key={i}>
            {/* Pin marker */}
            <div
              className="annotation-pin"
              onClick={() => setActivePin(isActive ? null : i)}
              style={{
                left: `${pin.x}%`,
                top: `${pin.y}%`,
                background: color,
                zIndex: 10 + i,
                transform: isActive
                  ? 'translate(-50%, -50%) scale(1.3)'
                  : 'translate(-50%, -50%)',
              }}
            >
              {i + 1}
            </div>

            {/* Tooltip */}
            {isActive && (
              <div
                className="annotation-tooltip"
                style={{
                  left: `${pin.x}%`,
                  top: `${pin.y + 5}%`,
                  borderColor: `${color}40`,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 4 }}>
                  {pin.author || 'Anonymous'}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.4 }}>{pin.comment}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
