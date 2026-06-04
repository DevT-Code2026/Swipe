import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import RoleFlowToggle from '../components/RoleFlowToggle';
import BackButton from '../components/BackButton';

export default function ReviewerDashboard() {
  const navigate = useNavigate();
  const { reviewer, reviewerLogout } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const doneSessions = sessions.filter((session) => session.reviewerStatus === 'done');
  const uniqueClients = new Set(doneSessions.map((session) => session.clientName || session.clientId || 'Client')).size;
  const uniqueProjects = new Set(doneSessions.map((session) => session.projectName || session.projectId || 'Project')).size;

  useEffect(() => {
    api
      .listReviewerSessions()
      .then((data) => setSessions(data.sessions || []))
      .catch((err) => setError(err.message || 'Failed to load sessions'))
      .finally(() => setLoading(false));
  }, []);

  const normalize = (value, fallback) => {
    const text = String(value || '').trim();
    return text || fallback;
  };

  const groupedClients = useMemo(() => {
    const groups = doneSessions.reduce((acc, session) => {
      const clientId = session.clientId || `client-${normalize(session.clientName, 'unknown').toLowerCase()}`;
      const clientName = normalize(session.clientName, 'Unknown Client');
      const projectId = session.projectId || `project-${normalize(session.projectName, 'unknown').toLowerCase()}`;
      const projectName = normalize(session.projectName, 'Untitled Project');

      if (!acc[clientId]) {
        acc[clientId] = {
          clientId,
          clientName,
          projects: {},
        };
      }

      if (!acc[clientId].projects[projectId]) {
        acc[clientId].projects[projectId] = {
          projectId,
          projectName,
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
            sessions: [...project.sessions].sort((a, b) => {
              const aTime = new Date(a.reviewerSubmittedAt || a.updatedAt || 0).getTime();
              const bTime = new Date(b.reviewerSubmittedAt || b.updatedAt || 0).getTime();
              return bTime - aTime;
            }),
          }))
          .sort((a, b) => a.projectName.localeCompare(b.projectName)),
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [doneSessions]);

  const renderStatus = (status) => {
    const normalized = String(status || 'draft').toLowerCase();
    const cls = normalized === 'active' ? 'badge-active' : normalized === 'closed' ? 'badge-closed' : 'badge-draft';
    return <span className={`badge ${cls}`}>{normalized}</span>;
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return 'just now';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="app-shell">
      <div className="page">
        <div className="header-bar anim-fade-up" style={{ marginBottom: 14 }}>
          <div>
            <div style={{ marginBottom: 8 }}>
              <BackButton />
            </div>
            <div className="logo">
              Creative<span>Swipe</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--sub)', marginTop: 4 }}>
              Reviewer: {reviewer?.name || reviewer?.email || 'Account'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={reviewerLogout}>Logout</button>
          </div>
        </div>

        <div className="anim-fade-up" style={{ marginBottom: 10 }}>
          <RoleFlowToggle active="receiver" senderPath="/" receiverPath="/reviewer" />
        </div>

        {!loading && !error && (
          <div className="stats-grid-3" style={{ marginBottom: 14 }}>
            <div className="stat-card">
              <div className="num">{doneSessions.length}</div>
              <div className="label">Reviews Done</div>
            </div>
            <div className="stat-card">
              <div className="num">{uniqueClients}</div>
              <div className="label">Clients</div>
            </div>
            <div className="stat-card">
              <div className="num">{uniqueProjects}</div>
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
                      .filter((image, idx, list) => image?.id && list.findIndex((candidate) => candidate.id === image.id) === idx)
                      .slice(0, 16);

                    const projectPostCount = project.sessions.reduce(
                      (sum, item) => sum + (Number(item.postCount) || 0),
                      0
                    );
                    const hasAnyUploads = project.sessions.some((item) => (Number(item.imageCount) || 0) > 0);
                    const resolvedPostCount = projectPostCount > 0 ? projectPostCount : hasAnyUploads ? 1 : 0;

                    const totalReviewsGiven = project.sessions.reduce(
                      (sum, item) => sum + (Number(item.reviewerSubmissionCount) || 0),
                      0
                    );

                    const totalDecisions = project.sessions.reduce(
                      (sum, item) => sum + (Number(item.reviewerDecisionCount) || 0),
                      0
                    );

                    const totalComments = project.sessions.reduce(
                      (sum, item) => sum + (Number(item.reviewerAnnotationCount) || 0),
                      0
                    );

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
                                  <img
                                    src={image.url}
                                    alt={image.fileName || 'Creative asset'}
                                    className="dashboard-thumb"
                                  />
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
                            <div className="dashboard-project-title">{project.projectName}</div>
                            <div>{renderStatus(projectStatus)}</div>
                          </div>

                          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4, marginBottom: 6 }}>
                            {project.sessions.length} session{project.sessions.length !== 1 ? 's' : ''} · {resolvedPostCount} post{resolvedPostCount !== 1 ? 's' : ''} · {projectImages.length > 0 ? projectImages.length : project.sessions.reduce((sum, item) => sum + (Number(item.imageCount) || 0), 0)} image(s)
                          </div>

                          <div className="dashboard-reviewer-row" style={{ marginBottom: 6 }}>
                            <div className="dashboard-reviewer-name">Total reviews given</div>
                            <div className="dashboard-reviewer-state dashboard-reviewer-done">{totalReviewsGiven}</div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, color: 'var(--sub)', fontSize: 12 }}>
                            <div>{totalDecisions} decisions · {totalComments} comments</div>
                            <div>{latestSession?.reviewerSubmittedAt ? timeAgo(latestSession.reviewerSubmittedAt) : timeAgo(latestSession?.updatedAt)}</div>
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
