import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);
const RECEIVER_LOGOUT_FLAG = 'receiverLogoutRequested';
const normalizeEmail = (value) => String(value || '').toLowerCase().trim();

export function AuthProvider({ children }) {
  const [creator, setCreator] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('creatorToken'));
  const [reviewer, setReviewer] = useState(null);
  const [reviewerAccountToken, setReviewerAccountToken] = useState(localStorage.getItem('reviewerAccountToken'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setLoading(true);
      try {
        // Consume Google OAuth redirect token if present in URL
        const oauth = api.consumeOAuthToken();
        let activeToken = token;
        let activeReviewerToken = reviewerAccountToken;

        if (oauth && !oauth.error) {
          if (oauth.role === 'creator') {
            activeToken = oauth.token;
            if (mounted) setToken(oauth.token);
          } else if (oauth.role === 'reviewer') {
            activeReviewerToken = oauth.token;
            if (mounted) setReviewerAccountToken(oauth.token);
          }
        }

        if (activeToken) {
          api.setCreatorToken(activeToken);
          try {
            const data = await api.getMe();
            if (mounted) setCreator(data);
          } catch {
            if (mounted) {
              api.clearCreatorSession();
              setCreator(null);
              setToken(null);
            }
          }
        } else if (mounted) {
          setCreator(null);
        }

        if (activeReviewerToken) {
          api.setReviewerAccountToken(activeReviewerToken);
          try {
            const data = await api.getReviewerMe();
            if (mounted) setReviewer(data);
          } catch {
            if (mounted) {
              api.clearReviewerSession();
              setReviewer(null);
              setReviewerAccountToken(null);
            }
          }
        } else if (mounted) {
          setReviewer(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();
    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reviewerAccountToken]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    const normalizedEmail = normalizeEmail(email);
    if (reviewer && normalizeEmail(reviewer.email) !== normalizedEmail) {
      sessionStorage.setItem(RECEIVER_LOGOUT_FLAG, '1');
      api.clearReviewerSession();
      setReviewerAccountToken(null);
      setReviewer(null);
    }
    setToken(data.token);
    setCreator(data.creator);
    return data;
  };

  const register = async (email, password, name) => {
    const data = await api.register(email, password, name);
    const normalizedEmail = normalizeEmail(email);
    if (reviewer && normalizeEmail(reviewer.email) !== normalizedEmail) {
      sessionStorage.setItem(RECEIVER_LOGOUT_FLAG, '1');
      api.clearReviewerSession();
      setReviewerAccountToken(null);
      setReviewer(null);
    }
    setToken(data.token);
    setCreator(data.creator);
    return data;
  };

  const reviewerLogin = async (email, password) => {
    const data = await api.reviewerLogin(email, password);
    const normalizedEmail = normalizeEmail(email);
    if (creator && normalizeEmail(creator.email) !== normalizedEmail) {
      api.clearCreatorSession();
      setToken(null);
      setCreator(null);
    }
    sessionStorage.removeItem(RECEIVER_LOGOUT_FLAG);
    setReviewerAccountToken(data.token);
    setReviewer(data.reviewer);
    return data;
  };

  const reviewerRegister = async (name, email, password) => {
    const data = await api.reviewerRegister(name, email, password);
    const normalizedEmail = normalizeEmail(email);
    if (creator && normalizeEmail(creator.email) !== normalizedEmail) {
      api.clearCreatorSession();
      setToken(null);
      setCreator(null);
    }
    sessionStorage.removeItem(RECEIVER_LOGOUT_FLAG);
    setReviewerAccountToken(data.token);
    setReviewer(data.reviewer);
    return data;
  };

  const switchToReceiver = async (options = {}) => {
    const force = !!options.force;
    const creatorEmail = normalizeEmail(creator?.email);
    const reviewerEmail = normalizeEmail(reviewer?.email);

    if (reviewerAccountToken) {
      if (creatorEmail && reviewerEmail && creatorEmail === reviewerEmail) {
        return { ok: true, source: 'existing' };
      }
      if (creatorEmail && reviewerEmail && creatorEmail !== reviewerEmail) {
        sessionStorage.setItem(RECEIVER_LOGOUT_FLAG, '1');
        api.clearReviewerSession();
        setReviewerAccountToken(null);
        setReviewer(null);
      }
    }

    if (!force && sessionStorage.getItem(RECEIVER_LOGOUT_FLAG) === '1') {
      return { ok: false, reason: 'logged-out' };
    }
    if (!token || !creator?.hasReceiverAccess) {
      return { ok: false, reason: token ? 'not-allowed' : 'login-required' };
    }

    const data = await api.establishReceiverAccess();
    sessionStorage.removeItem(RECEIVER_LOGOUT_FLAG);
    setReviewerAccountToken(data.token);
    setReviewer(data.reviewer);
    return { ok: true, source: 'handoff' };
  };

  const switchToSender = async () => {
    const creatorEmail = normalizeEmail(creator?.email);
    const reviewerEmail = normalizeEmail(reviewer?.email);

    if (token) {
      if (creatorEmail && reviewerEmail && creatorEmail === reviewerEmail) {
        return { ok: true, source: 'existing' };
      }
      if (creatorEmail && reviewerEmail && creatorEmail !== reviewerEmail) {
        api.clearCreatorSession();
        setToken(null);
        setCreator(null);
      }
    }

    if (!reviewerAccountToken || !reviewer?.hasSenderAccess) {
      return { ok: false, reason: reviewerAccountToken ? 'not-allowed' : 'login-required' };
    }

    const data = await api.establishSenderAccess();
    setToken(data.token);
    setCreator(data.creator);
    return { ok: true, source: 'handoff' };
  };

  const reviewerLogout = () => {
    sessionStorage.setItem(RECEIVER_LOGOUT_FLAG, '1');
    api.clearReviewerSession();
    setReviewerAccountToken(null);
    setReviewer(null);
  };

  const logout = () => {
    sessionStorage.removeItem(RECEIVER_LOGOUT_FLAG);
    api.logout();
    setToken(null);
    setCreator(null);
    setReviewerAccountToken(null);
    setReviewer(null);
  };

  const value = useMemo(
    () => ({
      creator,
      token,
      reviewer,
      reviewerAccountToken,
      loading,
      hasReceiverAccess: !!creator?.hasReceiverAccess,
      hasSenderAccess: !!reviewer?.hasSenderAccess,
      login,
      register,
      reviewerLogin,
      reviewerRegister,
      switchToReceiver,
      switchToSender,
      logout,
      reviewerLogout,
      googleAuthCreator: () => api.googleAuthCreator(),
      googleAuthReviewer: () => api.googleAuthReviewer(),
    }),
    [creator, token, reviewer, reviewerAccountToken, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
