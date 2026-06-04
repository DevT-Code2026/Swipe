import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateSession from './pages/CreateSession';
import SessionResults from './pages/SessionResults';
import ReviewerEntry from './pages/ReviewerEntry';
import ReviewerSwipe from './pages/ReviewerSwipe';
import ReviewComplete from './pages/ReviewComplete';
import ReviewerDashboard from './pages/ReviewerDashboard';
import ReviewerLogin from './pages/ReviewerLogin';
import ReviewerSessionHistory from './pages/ReviewerSessionHistory';

function AuthLoading() {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      <div style={{ color: 'var(--sub)', fontSize: 14 }}>Loading...</div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();

  if (loading) return <AuthLoading />;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function ReviewerProtectedRoute({ children }) {
  const { reviewerAccountToken, loading } = useAuth();

  if (loading) return <AuthLoading />;
  if (!reviewerAccountToken) return <Navigate to="/reviewer/login" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <div className="ambient-wrapper">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
      </div>

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sessions/new"
          element={
            <ProtectedRoute>
              <CreateSession />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sessions/:id"
          element={
            <ProtectedRoute>
              <SessionResults />
            </ProtectedRoute>
          }
        />

        <Route path="/r/:sessionId" element={<ReviewerEntry />} />
        <Route path="/r/:sessionId/review" element={<ReviewerSwipe />} />
        <Route path="/r/:sessionId/complete" element={<ReviewComplete />} />
        <Route path="/reviewer/login" element={<ReviewerLogin />} />
        <Route
          path="/reviewer"
          element={
            <ReviewerProtectedRoute>
              <ReviewerDashboard />
            </ReviewerProtectedRoute>
          }
        />
        <Route
          path="/reviewer/sessions/:sessionId/history"
          element={
            <ReviewerProtectedRoute>
              <ReviewerSessionHistory />
            </ReviewerProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
