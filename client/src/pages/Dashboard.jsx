import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
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

function formatBytes(bytes) {
  return `${((bytes || 0) / (1024 * 1024)).toFixed(1)} MB`;
}

function isVideoAsset(image) {
  const source = String(image?.contentType || image?.fileName || '').toLowerCase();
  return source.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(source);
}
function reviewerKey(reviewer) {
  return normalize(reviewer?.email, normalize(reviewer?.name, 'reviewer'));
}

export default function Dashboard() {
  const { creator, logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('all');

  const fetchSessions = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await api.listSessions();
      setSessions(data.sessions || []);
    } catch {
      setSessions([]);
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

  const groupedClients = useMemo(() => {
    const groups = sessions.reduce((acc, session) => {
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
              (left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)
            ),
          }))
          .filter((project) =>
            project.sessions.some(
              (session) => (Number(session.imageCount) || 0) > 0 || (session.previewImages || []).length > 0
            )
          )
          .sort((left, right) => {
            // Newest project (by most-recent session date) first
            const latestDate = (project) => {
              const s = project.sessions[0];
              return new Date(s?.updatedAt || s?.createdAt || 0).getTime();
            };
            return latestDate(right) - latestDate(left);
          }),
      }))
      .filter((client) => client.projects.length > 0)
      .sort((left, right) => left.clientName.localeCompare(right.clientName));
  }, [sessions]);

  useEffect(() => {
    if (selectedClientId === 'all') return;
    if (!groupedClients.some((client) => client.clientId === selectedClientId)) {
      setSelectedClientId('all');
    }
  }, [groupedClients, selectedClientId]);

  const visibleClients = useMemo(() => {
    if (selectedClientId === 'all') return groupedClients;
    return groupedClients.filter((client) => client.clientId === selectedClientId);
  }, [groupedClients, selectedClientId]);

  const openProjects = groupedClients.reduce(
    (sum, client) =>
      sum +
      client.projects.filter((project) =>
        project.sessions.some((session) => String(session.status || '').toLowerCase() !== 'closed')
      ).length,
    0
  );

  const feedbackGiven = sessions.reduce((sum, session) => sum + (Number(session.submissionCount) || 0), 0);

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

  return (
    <div className="app-shell">
      <div className="page">
        <div className="header-bar header-bar-dashboard anim-fade-up" style={{ marginBottom: 14 }}>
          <div className="header-bar-dashboard-top">
            <div className="logo">
              Creative<span>Swipe</span>
            </div>
            <button className="btn-ghost" onClick={logout}>
              Logout
            </button>
          </div>
          <div className="header-bar-dashboard-subtitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Welcome, {creator?.name || creator?.email || 'Creator'}</span>
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.02em', color: (Number(creator?.usedBytes || 0) > 500 * 1024 * 1024) ? 'var(--fail)' : 'var(--sub)' }}>
              {formatBytes(creator?.usedBytes || 0)} / 500.0 MB
            </span>
          </div>
        </div>

        <div className="anim-fade-up" style={{ marginBottom: 12 }}>
          <RoleFlowToggle active="sender" />
        </div>

        <div className="anim-fade-up" style={{ marginBottom: 12 }}>
          <label className="field-label">Select Client</label>
          <select
            className="field"
            value={selectedClientId}
            onChange={(event) => setSelectedClientId(event.target.value)}
            style={{ cursor: 'pointer' }}
          >
            <option value="all">All Clients</option>
            {groupedClients.map((client) => (
              <option key={client.clientId} value={client.clientId}>
                {client.clientName}
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn-accent anim-fade-up"
          onClick={() => navigate('/sessions/new')}
          style={{ marginBottom: 12 }}
        >
          + New Review Session
        </button>

        <div className="stats-grid-3 anim-fade-up" style={{ marginBottom: 14 }}>
          <div className="stat-card">
            <div className="num">{openProjects}</div>
            <div className="label">Open Project</div>
          </div>
          <div className="stat-card">
            <div className="num" style={{ color: 'var(--like)' }}>{feedbackGiven}</div>
            <div className="label">Feedback Given</div>
          </div>
          <div className="stat-card">
            <div className="num" style={{ color: 'var(--accent)' }}>{groupedClients.length}</div>
            <div className="label">No of Clients</div>
          </div>
        </div>

        <div className="anim-fade-up" style={{ animationDelay: '0.1s' }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--sub)',
              marginBottom: 14,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Project Reviews
          </h3>

          {loading ? (
            <div className="loading-screen" style={{ height: 180 }}>
              <div className="spinner" />
            </div>
          ) : visibleClients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 8px', color: 'var(--sub)', fontSize: 14 }}>
              No sessions yet. Create your first review session.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {visibleClients.map((client) => (
                <div key={client.clientId} className="dashboard-client-card fade-in">
                  <div className="dashboard-card-header" style={{ marginBottom: 10 }}>
                    <div className="dashboard-client-block">
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
                        const projectStatus = String(latestSession?.status || 'draft').toLowerCase();

                        const projectImages = (latestSession?.previewImages || [])
                          .filter((image, index, list) => image?.id && list.findIndex((candidate) => candidate.id === image.id) === index)
                          .slice(0, 16);

                        const postCount = Number(latestSession?.postCount) || 0;
                        const fallbackImages = Number(latestSession?.imageCount) || 0;
                        const imageCount = projectImages.length > 0 ? projectImages.length : fallbackImages;
                        const reviewerSummaries = Array.from(
                          [latestSession]
                            .flatMap((item) => item.reviewerProgress || [])
                            .filter((reviewer) => String(reviewer.status || '').toLowerCase() === 'done')
                            .reduce((acc, reviewer) => {
                            const key = reviewerKey(reviewer);
                            const existing = acc.get(key) || {
                              name: normalize(reviewer.name || reviewer.email, 'Reviewer'),
                              email: normalize(reviewer.email, ''),
                              likeCount: 0,
                              dislikeCount: 0,
                              annotationCount: 0,
                              submissionCount: 0,
                              submittedAt: null,
                            };

                            existing.likeCount += Number(reviewer.likeCount) || 0;
                            existing.dislikeCount += Number(reviewer.dislikeCount) || 0;
                            existing.annotationCount += Number(reviewer.annotationCount) || 0;
                            existing.submissionCount += Number(reviewer.submissionCount) || 0;

                            const reviewerTime = new Date(reviewer.submittedAt || 0).getTime();
                            const existingTime = new Date(existing.submittedAt || 0).getTime();
                            if (reviewerTime && reviewerTime >= existingTime) {
                              existing.submittedAt = reviewer.submittedAt;
                            }

                            acc.set(key, existing);
                            return acc;
                          }, new Map())
                          .values()
                      ).sort((left, right) => {
                        const rightTime = new Date(right.submittedAt || 0).getTime();
                        const leftTime = new Date(left.submittedAt || 0).getTime();
                        if (rightTime !== leftTime) return rightTime - leftTime;
                        return left.name.localeCompare(right.name);
                        });
                        const visibleReviewerSummaries = reviewerSummaries.slice(0, 3);
                        const extraReviewerCount = Math.max(0, reviewerSummaries.length - visibleReviewerSummaries.length);
                        const totalLikes = Number(latestSession?.likeCount) || 0;
                        const totalDislikes = Number(latestSession?.dislikeCount) || 0;
                        const totalComments = Number(latestSession?.annotationCount) || 0;
                        const lastActivity = latestSession?.updatedAt || latestSession?.createdAt || null;

                        return (
                        <div key={project.projectId} className="dashboard-project-card">
                          <div className="session-item" onClick={() => latestSession && navigate(`/sessions/${latestSession.id}`)}>
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
                                <div className="dashboard-thumb-empty">No uploaded images</div>
                              )}
                            </div>

                            <div className="dashboard-session-topline">
                              <div className="dashboard-project-block">
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
                                {visibleReviewerSummaries.length > 0 ? (
                                  <>
                                    {visibleReviewerSummaries.map((reviewer) => (
                                      <div key={reviewerKey(reviewer)} className="dashboard-reviewer-entry">
                                        <div className="dashboard-reviewer-name dashboard-reviewer-name-stack">{reviewer.name}</div>
                                      </div>
                                    ))}
                                    {extraReviewerCount > 0 && (
                                      <div className="dashboard-reviewer-more">+{extraReviewerCount} more</div>
                                    )}
                                  </>
                                ) : (
                                  <div className="dashboard-reviewer-name dashboard-reviewer-name-muted">
                                    No reviewers yet
                                  </div>
                                )}
                              </div>
                              <div className="dashboard-reviewer-metrics dashboard-reviewer-metrics-stack">
                                <span className="metric-chip metric-chip-like">{Math.max(0, totalLikes)}</span>
                                <span className="metric-chip metric-chip-dislike">{Math.max(0, totalDislikes)}</span>
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
    </div>
  );
}
