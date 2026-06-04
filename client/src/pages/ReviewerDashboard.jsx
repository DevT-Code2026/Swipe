import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import RoleFlowToggle from '../components/RoleFlowToggle';

function normalize(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function formatRelativeTime(value) {
  if (!value) return 'No recent activity';
  const time = new Date(value).getTime();
  if (!time) return 'No recent activity';
  const delta = Math.max(0, Date.now() - time);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isVideoAsset(image) {
  const source = String(image?.contentType || image?.fileName || '').toLowerCase();
  return source.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(source);
}

export default function ReviewerDashboard() {
  const navigate = useNavigate();
  const { reviewer, reviewerLogout } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSessions = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await api.listReviewerSessions();
      setSessions(data.sessions || []);
      setError('');
    } catch (err) {
      setSessions([]);
      setError(err.message || 'Failed to load sessions');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const safeFetch = async (showLoading = false) => {
      if (!active) return;
      await fetchSessions(showLoading);
    };

    safeFetch(true);

    const refreshOnFocus = () => {
      safeFetch(false);
    };

    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        safeFetch(false);
      }
    };

    const interval = window.setInterval(() => {
      safeFetch(false);
    }, 15000);

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [fetchSessions]);

  const doneSessions = sessions.filter((session) => session.reviewerStatus === 'done');
  const uniqueClients = new Set(doneSessions.map((session) => session.clientName || session.clientId || 'Client')).size;
  const uniqueProjects = new Set(doneSessions.map((session) => session.projectName || session.projectId || 'Project')).size;

  const groupedClients = useMemo(() => {
    const groups = doneSessions.reduce((acc, session) => {
      const clientId = session.clientId || `client-${normalize(session.clientName, 'unknown').toLowerCase()}`;
      const projectId = session.projectId || `project-${normalize(session.projectName, 'unknown').toLowerCase()}`;

      if (!acc[clientId]) {
        acc[clientId] = {
          clientId,
          clientName: normalize(session.clientName, 'Unknown Client'),
          projects: {},
        };
      }

      if (!acc[clientId].projects[projectId]) {
        acc[clientId].projects[projectId] = {
          projectId,
          projectName: normalize(session.projectName, 'Untitled Project'),
          sessions: [],
        };
      }

      acc[clientId].projects[projectId].sessions.push(session);
      return acc;
    }, {});

    return Object.values(groups)
      .map((client) => ({
        ...client,
        projects: Object.values(client.projects)
          .map((project) => ({
            ...project,
            sessions: [...project.sessions].sort(
              (left, right) =>
                new Date(right.reviewerSubmittedAt || right.updatedAt || 0) -
                new Date(left.reviewerSubmittedAt || left.updatedAt || 0)
            ),
          }))
          .sort((left, right) => left.projectName.localeCompare(right.projectName)),
      }))
      .sort((left, right) => left.clientName.localeCompare(right.clientName));
  }, [doneSessions]);

  const renderStatus = (status) => {
    const normalizedStatus = String(status || 'draft').toLowerCase();
    const cls =
      normalizedStatus === 'active'
        ? 'badge-active'
        : normalizedStatus === 'closed'
          ? 'badge-closed'
          : 'badge-draft';
    return <span className={`badge ${cls}`}>{normalizedStatus}</span>;
  };

  const showBecomeSender = !reviewer?.hasSenderAccess;

  return (
    <div className="app-shell">
      <div className="page">
        <div className="header-bar header-bar-dashboard anim-fade-up" style={{ marginBottom: 14 }}>
          <div className="header-bar-dashboard-top">
            <div className="logo">
              Creative<span>Swipe</span>
            </div>
            <button className="btn-ghost" onClick={reviewerLogout}>
              Logout
            </button>
          </div>
          <div className="header-bar-dashboard-subtitle">
            Reviewer: {reviewer?.name || reviewer?.email || 'Account'}
          </div>
        </div>

        <div className="anim-fade-up" style={{ marginBottom: 12 }}>
          <RoleFlowToggle active="receiver" />
        </div>

        {showBecomeSender && (
          <div
            className="anim-fade-up"
            style={{
              marginBottom: 14,
              padding: '14px 16px',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Want to become a sender?</div>
            <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.5, marginBottom: 12 }}>
              Use the same name and email to create a sender account and start sharing review links.
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                navigate('/login', {
                  state: {
                    mode: 'register',
                    name: reviewer?.name || '',
                    email: reviewer?.email || '',
                  },
                })
              }
            >
              Become a Sender
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="stats-grid-3" style={{ marginBottom: 14 }}>
            <div className="stat-card">
              <div className="num">{doneSessions.length}</div>
              <div className="label">Reviews Done</div>
            </div>
            <div className="stat-card">
              <div className="num" style={{ color: 'var(--like)' }}>{uniqueClients}</div>
              <div className="label">Clients</div>
            </div>
            <div className="stat-card">
              <div className="num" style={{ color: 'var(--accent)' }}>{uniqueProjects}</div>
              <div className="label">Projects</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-screen" style={{ height: 180 }}>
            <div className="spinner" />
          </div>
        ) : error ? (
          <div className="error-box">{error}</div>
        ) : doneSessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '26px 8px', color: 'var(--sub)' }}>
            No shared projects yet. Open a sender link to claim a project.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groupedClients.map((client) => (
              <div key={client.clientId} className="dashboard-client-card fade-in">
                <div className="dashboard-card-header" style={{ marginBottom: 8 }}>
                  <div>
                    <div className="dashboard-entity-label">Client</div>
                    <div className="dashboard-client-title">{client.clientName}</div>
                    <div className="dashboard-client-meta">
                      {client.projects.length} project{client.projects.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                <div className="dashboard-project-list">
                  {client.projects.map((project) => {
                    const latestSession = project.sessions[0] || null;
                    const projectStatus = project.sessions.some((item) => String(item.status || '').toLowerCase() === 'active')
                      ? 'active'
                      : project.sessions.every((item) => String(item.status || '').toLowerCase() === 'closed')
                        ? 'closed'
                        : 'draft';

                    const projectImages = project.sessions
                      .flatMap((item) => item.previewImages || [])
                      .filter((image, index, list) => image?.id && list.findIndex((candidate) => candidate.id === image.id) === index)
                      .slice(0, 16);

                    const postCount = project.sessions.reduce((sum, item) => sum + (Number(item.postCount) || 0), 0);
                    const fallbackImages = project.sessions.reduce((sum, item) => sum + (Number(item.imageCount) || 0), 0);
                    const imageCount = projectImages.length > 0 ? projectImages.length : fallbackImages;
                    const totalApprovals = project.sessions.reduce((sum, item) => sum + (Number(item.reviewerLikeCount) || 0), 0);
                    const totalRejections = project.sessions.reduce((sum, item) => sum + (Number(item.reviewerDislikeCount) || 0), 0);
                    const totalComments = project.sessions.reduce((sum, item) => sum + (Number(item.reviewerAnnotationCount) || 0), 0);
                    const lastActivity = latestSession?.reviewerSubmittedAt || latestSession?.updatedAt || null;

                    return (
                      <div key={project.projectId} className="dashboard-project-card">
                        <div
                          className="session-item"
                          onClick={() => latestSession && navigate(`/reviewer/sessions/${latestSession.id}/history`)}
                        >
                          <div className="dashboard-thumb-scroll">
                            {projectImages.length > 0 ? (
                              projectImages.map((image) => (
                                <div key={image.id} className="dashboard-thumb-wrap">
                                  {isVideoAsset(image) ? (
                                    <video
                                      src={image.url || image.signedUrl}
                                      className="dashboard-thumb"
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : (
                                    <img
                                      src={image.url || image.signedUrl}
                                      alt={image.fileName || 'Creative asset'}
                                      className="dashboard-thumb"
                                    />
                                  )}
                                  {Number(image.rowOrder) > 0 && (
                                    <span className="dashboard-post-badge">P{image.rowOrder}</span>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="dashboard-thumb-empty">No reviewed images</div>
                            )}
                          </div>

                          <div className="dashboard-session-topline">
                            <div>
                              <div className="dashboard-entity-label dashboard-entity-label-project">Project</div>
                              <div className="dashboard-project-title">{project.projectName}</div>
                            </div>
                            <div>{renderStatus(projectStatus)}</div>
                          </div>

                          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4, marginBottom: 8 }}>
                            {postCount} post{postCount !== 1 ? 's' : ''} | {imageCount} image{imageCount !== 1 ? 's' : ''}
                          </div>

                          <div className="dashboard-reviewer-row dashboard-reviewer-row-restored">
                            <div className="dashboard-reviewer-list">
                              <div className="dashboard-reviewer-name dashboard-reviewer-name-stack">
                                {reviewer?.name || reviewer?.email || 'Reviewer'}
                              </div>
                            </div>
                            <div className="dashboard-reviewer-metrics">
                              <span className="metric-chip metric-chip-like">{Math.max(0, totalApprovals)}</span>
                              <span className="metric-chip metric-chip-dislike">{Math.max(0, totalRejections)}</span>
                            </div>
                          </div>

                          <div className="dashboard-project-foot">
                            <div>{totalComments} comment{totalComments !== 1 ? 's' : ''}</div>
                            <div className="dashboard-project-time">{formatRelativeTime(lastActivity)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
