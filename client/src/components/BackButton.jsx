import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function BackButton({ label = 'Back' }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="btn-back"
      onClick={() => navigate(-1)}
      aria-label={label}
    >
      &lt; {label}
    </button>
  );
}
