import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleFlowToggle({ active = 'receiver' }) {
  const navigate = useNavigate();
  const {
    creator,
    reviewer,
    hasReceiverAccess,
    hasSenderAccess,
    switchToReceiver,
    switchToSender,
  } = useAuth();
  const [switching, setSwitching] = useState('');

  const handleSender = async () => {
    if (active === 'sender') return;
    if (!hasSenderAccess) return;
    setSwitching('sender');
    try {
      const result = await switchToSender();
      if (result.ok) {
        navigate('/', { replace: true });
        return;
      }
      navigate('/login', {
        replace: true,
        state: {
          mode: result.reason === 'not-allowed' ? 'register' : 'login',
          name: reviewer?.name || creator?.name || '',
          email: reviewer?.email || creator?.email || '',
        },
      });
    } finally {
      setSwitching('');
    }
  };

  const handleReceiver = async () => {
    if (active === 'receiver') return;
    if (!hasReceiverAccess) return;
    setSwitching('receiver');
    try {
      const result = await switchToReceiver({ force: true });
      if (result.ok) {
        navigate('/reviewer', { replace: true });
        return;
      }
      navigate('/reviewer/login', {
        replace: true,
        state: {
          mode: result.reason === 'not-allowed' ? 'register' : 'login',
          name: creator?.name || reviewer?.name || '',
          email: creator?.email || reviewer?.email || '',
        },
      });
    } finally {
      setSwitching('');
    }
  };

  const showSender = active === 'sender' || hasSenderAccess;
  const showReceiver = active === 'receiver' || hasReceiverAccess;

  return (
    <div className="role-flow-toggle">
      {showSender && (
        <button
          type="button"
          className={`role-flow-btn ${active === 'sender' ? 'role-flow-btn-active' : ''}`}
          onClick={handleSender}
          disabled={switching === 'sender'}
        >
          {switching === 'sender' ? 'Opening...' : 'Sender'}
        </button>
      )}
      {showReceiver && (
        <button
          type="button"
          className={`role-flow-btn ${active === 'receiver' ? 'role-flow-btn-active' : ''}`}
          onClick={handleReceiver}
          disabled={switching === 'receiver'}
        >
          {switching === 'receiver' ? 'Opening...' : 'Receiver'}
        </button>
      )}
    </div>
  );
}
