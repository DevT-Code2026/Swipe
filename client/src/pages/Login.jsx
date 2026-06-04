import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register, reviewerLogin, googleAuthCreator } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const state = location.state || {};
    if (state.mode === 'register') setIsRegister(true);
    if (state.mode === 'login') setIsRegister(false);
    if (typeof state.email === 'string') setEmail(state.email);
    if (typeof state.name === 'string') setName(state.name);
    // Handle Google OAuth error redirect
    const params = new URLSearchParams(window.location.search);
    const googleErr = params.get('google_error');
    if (googleErr) {
      const msgs = { cancelled: 'Google sign-in was cancelled.', no_email: 'Google account has no email.', server_error: 'Server error during Google sign-in.' };
      setError(msgs[googleErr] || 'Google sign-in failed. Please try again.');
      params.delete('google_error');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
    }
  }, [location.state]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(email.trim(), password, name.trim());
        navigate('/', { replace: true });
      } else {
        try {
          await login(email.trim(), password);
          navigate('/', { replace: true });
          return;
        } catch (senderError) {
          try {
            await reviewerLogin(email.trim(), password);
            navigate('/reviewer', { replace: true });
            return;
          } catch {
            throw senderError;
          }
        }
      }
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
          <div
            className="logo"
            style={{
              fontSize: 28,
              margin: '0 auto 6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Creative<span>Swipe</span>
          </div>
          <div style={{ color: 'var(--sub)', fontSize: 13 }}>
            Collaborative Creative Review Platform
          </div>
        </div>

        <form onSubmit={handleSubmit} className="fade-in" style={{ animationDelay: '0.1s' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h2>

          {/* Google sign-in */}
          <button
            id="google-signin-creator"
            type="button"
            onClick={googleAuthCreator}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%', padding: '11px 16px', marginBottom: 16,
              background: '#fff', color: '#3c4043', border: '1px solid #dadce0',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--sub)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

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
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              {!isRegister && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setError('Please contact the support staff or the admin')}
                  style={{ marginTop: 10 }}
                >
                  Forgot Password?
                </button>
              )}
            </div>

            {error && <div className="error-box">{error}</div>}

            <button
              type="submit"
              className="btn-accent"
              disabled={loading}
              style={{ marginTop: 2, width: '100%' }}
            >
              {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </div>
        </form>

        <div className="fade-in" style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: 'var(--sub)', animationDelay: '0.2s' }}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}
