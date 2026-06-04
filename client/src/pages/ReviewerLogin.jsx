import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RoleFlowToggle from '../components/RoleFlowToggle';

export default function ReviewerLogin() {
  const navigate = useNavigate();
  const { reviewerLogin, reviewerRegister, reviewer, loading: authLoading } = useAuth();

  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && reviewer) {
      navigate('/reviewer', { replace: true });
    }
  }, [authLoading, reviewer, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await reviewerRegister(name.trim(), email.trim(), password);
      } else {
        await reviewerLogin(email.trim(), password);
      }
      navigate('/reviewer');
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell" style={{ minHeight: '100vh', justifyContent: 'center' }}>
      <div style={{ maxWidth: 520, width: '100%', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }} className="fade-in">
          <div className="logo" style={{ fontSize: 28, marginBottom: 6 }}>
            Creative<span>Swipe</span>
          </div>
          <div style={{ color: 'var(--sub)', fontSize: 13 }}>
            Receiver Dashboard Access
          </div>
        </div>

        <div className="fade-in" style={{ marginBottom: 14, animationDelay: '0.08s' }}>
          <RoleFlowToggle active="receiver" senderPath="/login" receiverPath="/reviewer/login" />
        </div>

        <form onSubmit={handleSubmit} className="fade-in" style={{ animationDelay: '0.1s' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>
            {isRegister ? 'Create Receiver Account' : 'Receiver Sign In'}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isRegister && (
              <div>
                <label className="field-label">Name</label>
                <input
                  className="field"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label className="field-label">Email</label>
              <input
                className="field"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="field-label">Password</label>
              <input
                className="field"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && <div className="error-box">{error}</div>}

            <button
              type="submit"
              className="btn-accent"
              disabled={loading}
              style={{ marginTop: 2, width: '100%' }}
            >
              {loading ? 'Please wait…' : isRegister ? 'Create Account' : 'Open Receiver Dashboard'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/login')}
              style={{ width: '100%' }}
            >
              Go to Sender Login
            </button>
          </div>
        </form>

        <div className="fade-in" style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: 'var(--sub)', animationDelay: '0.2s' }}>
          {isRegister ? 'Already have a receiver account?' : "Don't have a receiver account?"}{' '}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            style={{
              background: 'none', border: 'none',
              color: 'var(--accent)', fontWeight: 700,
              cursor: 'pointer', fontSize: 13,
            }}
          >
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}
