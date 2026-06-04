import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const SOCIAL_CHANNELS = ['LinkedIn', 'Instagram', 'YouTube'];

const makeRow = (channel = 'LinkedIn') => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  channel,
  text: '',
  file: null,
});

const sanitizeFileName = (name = 'upload') => String(name).replace(/\s+/g, '_');
const formatBytes = (bytes) => `${((bytes || 0) / (1024 * 1024)).toFixed(1)} MB`;

function PreviewIcon({ kind, size = 20, stroke = 'currentColor', fill = 'none' }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill,
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  switch (kind) {
    case 'dots':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.6" fill={stroke} stroke="none" />
          <circle cx="12" cy="12" r="1.6" fill={stroke} stroke="none" />
          <circle cx="19" cy="12" r="1.6" fill={stroke} stroke="none" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...common}>
          <path d="M12 20s-6.5-3.9-8.6-7.5C1.8 9.7 3.1 6.5 6.2 6.1c1.8-.2 3.1.6 3.8 1.9.7-1.3 2-2.1 3.8-1.9 3.1.4 4.4 3.6 2.8 6.4C18.5 16.1 12 20 12 20Z" />
        </svg>
      );
    case 'comment':
      return (
        <svg {...common}>
          <path d="M20 15a3 3 0 0 1-3 3H9l-4 3v-3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z" />
        </svg>
      );
    case 'share':
      return (
        <svg {...common}>
          <path d="M14 5h5v5" />
          <path d="M10 14 19 5" />
          <path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
        </svg>
      );
    case 'bookmark':
      return (
        <svg {...common}>
          <path d="M7 4h10v16l-5-3-5 3V4Z" />
        </svg>
      );
    case 'thumbUp':
      return (
        <svg {...common}>
          <path d="M7 11v9" />
          <path d="M10 20h6.2a2 2 0 0 0 1.9-1.4l1.4-4.2A2 2 0 0 0 17.6 12H14V7.6A2.6 2.6 0 0 0 11.4 5L10 11Z" />
          <path d="M7 11H4v9h3" />
        </svg>
      );
    case 'thumbDown':
      return (
        <svg {...common}>
          <path d="M17 13V4" />
          <path d="M14 4H7.8a2 2 0 0 0-1.9 1.4l-1.4 4.2A2 2 0 0 0 6.4 12H10v4.4A2.6 2.6 0 0 0 12.6 19L14 13Z" />
          <path d="M17 13h3V4h-3" />
        </svg>
      );
    case 'repost':
      return (
        <svg {...common}>
          <path d="M7 7h10l-3-3" />
          <path d="M17 17H7l3 3" />
          <path d="M17 7v4" />
          <path d="M7 17v-4" />
        </svg>
      );
    case 'send':
      return (
        <svg {...common}>
          <path d="m22 2-7 20-4-9-9-4 20-7Z" />
          <path d="M22 2 11 13" />
        </svg>
      );
    case 'arrowLeft':
      return (
        <svg {...common}>
          <path d="M15 18 9 12l6-6" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="M8 6v12l10-6Z" fill={stroke} stroke="none" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M7 7l1 12h8l1-12" />
          <path d="M10 11v5" />
          <path d="M14 11v5" />
        </svg>
      );
    default:
      return null;
  }
}

export default function CreateSession() {
  const navigate = useNavigate();
  const bulkInputRef = useRef(null);
  const [uploadMode, setUploadMode] = useState('bulk');
  const [selectedLayout, setSelectedLayout] = useState('LinkedIn');
  const [clientChoice, setClientChoice] = useState('other');
  const [projectChoice, setProjectChoice] = useState('other');
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [password, setPassword] = useState('');
  const [maxReviewers, setMaxReviewers] = useState('');
  const [historySessions, setHistorySessions] = useState([]);
  const [expectedReviewers, setExpectedReviewers] = useState([]);
  const [knownReviewerPick, setKnownReviewerPick] = useState('');
  const [newReviewerName, setNewReviewerName] = useState('');
  const [newReviewerEmail, setNewReviewerEmail] = useState('');
  const [platformRows, setPlatformRows] = useState([makeRow('LinkedIn')]);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdSession, setCreatedSession] = useState(null);
  const [copied, setCopied] = useState(false);
  const [usedStorage, setUsedStorage] = useState(0);
  const { creator } = useAuth();

  useEffect(() => {
    let mounted = true;
    api.listSessions().then((data) => {
      if (mounted) setHistorySessions(data.sessions || []);
    }).catch(() => {
      if (mounted) setHistorySessions([]);
    });
    
    if (creator?.usedBytes !== undefined) {
      setUsedStorage(Number(creator.usedBytes));
    }
    
    return () => { mounted = false; };
  }, [creator?.usedBytes]);

  const catalogSessions = useMemo(
    () =>
      historySessions.filter(
        (session) =>
          (Number(session.imageCount) || 0) > 0 ||
          (Number(session.postCount) || 0) > 0 ||
          (session.previewImages || []).length > 0
      ),
    [historySessions]
  );

  const clientCatalog = useMemo(() => {
    const map = new Map();
    catalogSessions.forEach((session) => {
      const normalizedClient = String(session.clientName || '').trim();
      if (!normalizedClient) return;
      const clientId = session.clientId || `client-${normalizedClient.toLowerCase()}`;
      if (!map.has(clientId)) {
        map.set(clientId, { id: clientId, name: normalizedClient, projects: new Map(), reviewers: new Map() });
      }
      const client = map.get(clientId);
      if (session.projectId && session.projectName) {
        client.projects.set(session.projectId, { id: session.projectId, name: session.projectName });
      }
      (session.reviewerProgress || []).forEach((reviewer) => {
        const email = String(reviewer.email || '').toLowerCase().trim();
        if (!email) return;
        client.reviewers.set(email, {
          email,
          name: String(reviewer.name || '').trim() || email.split('@')[0],
        });
      });
    });
    return Array.from(map.values()).map((client) => ({
      ...client,
      projects: Array.from(client.projects.values()).sort((a, b) => a.name.localeCompare(b.name)),
      reviewers: Array.from(client.reviewers.values()).sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogSessions]);

  const selectedClient = useMemo(
    () => clientCatalog.find((client) => client.id === clientChoice) || null,
    [clientCatalog, clientChoice]
  );
  const projectOptions = selectedClient?.projects || [];
  const knownReviewers = selectedClient?.reviewers || [];

  useEffect(() => {
    if (!selectedClient) return;
    setClientName(selectedClient.name);
    setProjectChoice('other');
    setProjectName('');
  }, [selectedClient]);

  useEffect(() => {
    if (projectChoice === 'other') return;
    const project = projectOptions.find((item) => item.id === projectChoice);
    if (project) setProjectName(project.name);
  }, [projectChoice, projectOptions]);

  useEffect(() => {
    setPlatformRows((prev) => prev.map((row) => ({ ...row, channel: selectedLayout })));
  }, [selectedLayout]);

  const addReviewer = (reviewer) => {
    const email = String(reviewer?.email || '').toLowerCase().trim();
    const name = String(reviewer?.name || '').trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return;
    setExpectedReviewers((prev) => prev.some((item) => item.email === email) ? prev : [...prev, { email, name: name || email.split('@')[0] }]);
  };

  const processLocalFile = (file) => new Promise((resolve) => {
    const MAX_SIZE = 500 * 1024 * 1024; // 500MB limit
    if (file.size > MAX_SIZE) {
      setError(`File "${file.name}" exceeds the 500MB limit. Please compress large 4K/8K videos.`);
      resolve(null);
      return;
    }
    resolve({
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      fileName: file.name,
      file,
      data: '',
      preview: URL.createObjectURL(file), // Fix lag: Use object URL instead of full Base64
      contentType: file.type || 'application/octet-stream',
    });
  });

  const currentUploads = useMemo(() => {
    if (uploadMode === 'bulk') {
      return bulkFiles.map((file, index) => ({
        fileName: sanitizeFileName(file.fileName),
        file: file.file,
        data: file.data,
        contentType: file.contentType,
        rowId: file.id,
        rowOrder: index + 1,
      }));
    }
    return platformRows.filter((row) => row.file).map((row, index) => ({
      fileName: `${row.channel}_${index + 1}_${sanitizeFileName(row.file.fileName)}`,
      file: row.file.file,
      data: row.file.data,
      contentType: row.file.contentType,
      templateChannel: row.channel,
      templateText: row.text || '',
      rowId: row.id,
      rowOrder: index + 1,
    }));
  }, [bulkFiles, platformRows, uploadMode]);

  const totalUploadBytes = currentUploads.reduce((sum, item) => sum + (item.file?.size || 0), 0);
  const MAX_ACCOUNT_LIMIT = 500 * 1024 * 1024;
  const combinedStorageBytes = usedStorage + totalUploadBytes;
  const isOverAccountLimit = combinedStorageBytes > MAX_ACCOUNT_LIMIT;

  useEffect(() => {
    if (isOverAccountLimit) {
      setError(`Storage limit reached! You have used ${formatBytes(usedStorage)} and are trying to add ${formatBytes(totalUploadBytes)}. Account limit is 500.0 MB.`);
    } else if (error && error.includes('Storage limit reached!')) {
      setError('');
    }
  }, [totalUploadBytes, usedStorage, isOverAccountLimit, error]);

  const reviewUrl = createdSession ? api.getPublicReviewUrl(createdSession.id) : '';

  const renderPlatformPreview = (row) => {
    const media = row.file;
    const isVideo = String(media?.contentType || '').startsWith('video/');
    const renderMedia = (className = '', { nativeControls = false } = {}) =>
      media ? (
        isVideo ? (
          <video
            className={className}
            src={media.preview}
            muted
            playsInline
            preload="metadata"
            controls={nativeControls}
            autoPlay={!nativeControls}
            loop={!nativeControls}
          />
        ) : (
          <img className={className} src={media.preview} alt={media.fileName} />
        )
      ) : (
        <div className="social-preview-media-empty">Upload media to preview this layout</div>
      );

    if (row.channel === 'Instagram') {
      return (
        <div className="platform-card template-platform-card ig-card ig-card-template">
          <div className="ig-top ig-top-template">
            <div className="ig-avatar" />
            <div className="ig-head-copy">
              <div className="ig-name">{projectName || 'project_account'}</div>
              <div className="ig-meta">{clientName || 'Client'} • just now</div>
            </div>
            <div className="ig-menu-btn">
              <PreviewIcon kind="dots" size={18} stroke="#fafafa" />
            </div>
          </div>
          <div className="ig-media ig-media-template">
            {renderMedia('', { nativeControls: false })}
          </div>
          <div className="ig-bottom ig-bottom-template">
            <div className="ig-actions ig-actions-real ig-actions-template">
              <div className="ig-actions-left">
                <span className="ig-action-button"><PreviewIcon kind="heart" size={22} stroke="#fafafa" /></span>
                <span className="ig-action-button"><PreviewIcon kind="comment" size={22} stroke="#fafafa" /></span>
                <span className="ig-action-button"><PreviewIcon kind="share" size={22} stroke="#fafafa" /></span>
              </div>
              <span className="ig-action-button ig-action-save-btn"><PreviewIcon kind="bookmark" size={22} stroke="#fafafa" /></span>
            </div>
            <div className="ig-caption">
              <strong>{projectName || 'project_account'}</strong>{' '}
              {row.text || 'Add caption'}
            </div>
          </div>
        </div>
      );
    }
    if (row.channel === 'LinkedIn') {
      return (
        <div className="platform-card template-platform-card li-card li-card-template">
          <div className="li-top li-top-template">
            <div className="li-avatar" />
            <div className="li-head-copy">
              <div className="li-company">{clientName || 'Client Company'}</div>
              <div className="li-meta">{projectName || 'Project'} • just now</div>
            </div>
            <div className="li-menu-btn">
              <PreviewIcon kind="dots" size={18} stroke="#5f6368" />
            </div>
          </div>
          <div className="li-copy li-copy-template">{row.text || 'Add caption'}</div>
          <div className="li-media li-media-template">{renderMedia('', { nativeControls: false })}</div>
          <div className="li-actions li-actions-template">
            <span className="li-action-button"><PreviewIcon kind="thumbUp" size={18} stroke="#666" />Like</span>
            <span className="li-action-button"><PreviewIcon kind="comment" size={18} stroke="#666" />Comment</span>
            <span className="li-action-button"><PreviewIcon kind="repost" size={18} stroke="#666" />Repost</span>
            <span className="li-action-button"><PreviewIcon kind="send" size={18} stroke="#666" />Send</span>
          </div>
        </div>
      );
    }
    return (
      <div className="platform-card template-platform-card yt-card yt-shorts-card">
        <div className="yt-media yt-shorts-media">{renderMedia('', { nativeControls: false })}</div>
        <div className="yt-shorts-top">
          <span className="yt-top-icon"><PreviewIcon kind="arrowLeft" size={20} stroke="#fff" /></span>
          <span className="yt-top-icon"><PreviewIcon kind="dots" size={20} stroke="#fff" /></span>
        </div>
        <div className="yt-shorts-actions">
          <span className="yt-action-item"><PreviewIcon kind="thumbUp" size={22} stroke="#fff" /></span>
          <span className="yt-action-item"><PreviewIcon kind="thumbDown" size={22} stroke="#fff" /></span>
          <span className="yt-action-item"><PreviewIcon kind="comment" size={22} stroke="#fff" /></span>
          <span className="yt-action-item"><PreviewIcon kind="share" size={22} stroke="#fff" /></span>
        </div>
        <div className="yt-content yt-shorts-content">
          <div className="yt-channel-row">
            <div className="yt-channel-avatar" />
            <div className="yt-channel-name">{clientName || 'Channel'}</div>
            <span className="yt-subscribe-chip">Subscribe</span>
          </div>
          <div className="yt-title">{row.text || `${projectName || 'Project'} Shorts title`}</div>
          <div className="yt-meta">{projectName || 'Project'} • Preview</div>
        </div>
      </div>
    );
  };

  const handlePlatformFileChange = async (rowIndex, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const converted = (await Promise.all(files.map((file) => processLocalFile(file)))).filter(Boolean);
    if (!converted.length) return;
    setPlatformRows((prev) => {
      const next = [...prev];
      const currentRow = next[rowIndex];
      if (!currentRow) return prev;
      next[rowIndex] = { ...currentRow, file: converted[0] || null };
      if (converted.length > 1) {
        const extraRows = converted.slice(1).map((file) => ({
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          channel: currentRow.channel,
          text: '',
          file,
        }));
        next.splice(rowIndex + 1, 0, ...extraRows);
      }
      return next;
    });
  };

  const handleBulkFileChange = async (fileList) => {
    const allowed = Array.from(fileList || []).filter((f) =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (!allowed.length) return;
    const converted = (await Promise.all(allowed.map((file) => processLocalFile(file)))).filter(Boolean);
    if (!converted.length) return;
    setBulkFiles((prev) => [...prev, ...converted]);
  };

  const removePlatformRow = (rowId) => {
    setPlatformRows((prev) => {
      if (prev.length === 1) {
        return prev.map((row) => (row.id === rowId ? { ...row, file: null, text: '' } : row));
      }
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const removeBulkFile = (fileId) => {
    setBulkFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const addPlatformRow = () => {
    setPlatformRows((prev) => [...prev, makeRow(selectedLayout)]);
  };

  const friendlyUploadError = (err) => {
    const message = String(err?.message || err?.data?.error || '').toLowerCase();
    if (
      message.includes('invalid string length') ||
      message.includes('payload too large') ||
      message.includes('entity too large') ||
      message.includes('request entity too large') ||
      message.includes('upload limit')
    ) {
      return 'You have exceeded the upload limit';
    }
    return err?.message || 'Failed to create session';
  };

  const handleCreate = async () => {
    setError('');
    setLoading(true);
    try {
      const generatedTitle = `${clientName.trim()} - ${projectName.trim()}`;
      const sessionData = {
        clientName: clientName.trim(),
        projectName: projectName.trim(),
        expectedReviewers,
      };
      if (clientChoice !== 'other') sessionData.clientId = clientChoice;
      if (projectChoice !== 'other') sessionData.projectId = projectChoice;
      if (deadline) sessionData.deadline = new Date(deadline).toISOString();
      if (password) sessionData.password = password;
      if (maxReviewers) sessionData.maxReviewers = parseInt(maxReviewers, 10);
      const { session } = await api.createSession(generatedTitle, sessionData);
      for (const upload of currentUploads) {
        await api.uploadImages(session.id, [upload]);
      }
      setCreatedSession(session);
      setStep(3);
    } catch (err) {
      setError(friendlyUploadError(err));
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.querySelector('.share-link-url');
      if (input) {
        input.focus();
        input.select();
      }
    }
  };

  const openNativeDateTimePicker = (event) => {
    if (typeof event.currentTarget.showPicker === 'function') {
      event.currentTarget.showPicker();
    }
  };

  return (
    <div className="app-shell">
      <div className="header-bar">
        <button
          className="btn-ghost"
          onClick={() => {
            if (step > 1 && !createdSession) setStep(step - 1);
            else navigate('/');
          }}
        >
          Back
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>
          {step === 3 ? 'Session Created' : 'New Review Session'}
        </h2>
        <div style={{ width: 64 }} />
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', width: '100%' }}>
        {step === 1 && (
          <div className="glass-panel fade-in" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24 }}>Session Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="field-label">Client *</label>
                <select
                  className="field"
                  value={clientChoice}
                  onChange={(event) => {
                    const value = event.target.value;
                    setClientChoice(value);
                    if (value === 'other') {
                      setClientName('');
                      setProjectChoice('other');
                      setProjectName('');
                    }
                  }}
                >
                  <option value="other">New Client</option>
                  {clientCatalog.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {clientChoice === 'other' && (
                  <input
                    className="field"
                    style={{ marginTop: 10 }}
                    placeholder="e.g., Panda Media"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                  />
                )}
              </div>

              <div>
                <label className="field-label">Project *</label>
                <select
                  className="field"
                  value={projectChoice}
                  onChange={(event) => {
                    const value = event.target.value;
                    setProjectChoice(value);
                    if (value === 'other') setProjectName('');
                  }}
                >
                  <option value="other">New Project</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {projectChoice === 'other' && (
                  <input
                    className="field"
                    style={{ marginTop: 10 }}
                    placeholder="e.g., Spring Social Campaign"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                )}
              </div>
              <div>
                <label className="field-label">Upload Mode *</label>
                <div className="layout-switch" style={{ marginTop: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  {['bulk', 'platform'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setUploadMode(mode)}
                      className={`layout-switch-btn ${uploadMode === mode ? 'layout-switch-btn-active' : ''}`}
                    >
                      {mode === 'platform' ? 'Platform Upload' : 'Bulk Upload'}
                    </button>
                  ))}
                </div>
              </div>

              {uploadMode === 'platform' && (
                <div>
                  <label className="field-label">Platform Layout *</label>
                  <div className="layout-switch" style={{ marginTop: 8 }}>
                    {SOCIAL_CHANNELS.map((channel) => (
                      <button
                        key={channel}
                        type="button"
                        onClick={() => setSelectedLayout(channel)}
                        className={`layout-switch-btn ${selectedLayout === channel ? 'layout-switch-btn-active' : ''}`}
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="field-label">Deadline (optional)</label>
                <div className="datetime-field-wrap">
                  <input
                    className="field field-datetime"
                    type="datetime-local"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                    onClick={openNativeDateTimePicker}
                    onFocus={openNativeDateTimePicker}
                  />
                  <button
                    type="button"
                    className="datetime-trigger"
                    onClick={(event) => {
                      const input = event.currentTarget.previousElementSibling;
                      if (input) {
                        input.focus();
                        if (typeof input.showPicker === 'function') input.showPicker();
                      }
                    }}
                    aria-label="Open deadline picker"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M7 3v4M17 3v4M3 9h18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div>
                <label className="field-label">Password Protection (optional)</label>
                <input
                  className="field"
                  type="text"
                  placeholder="Leave blank for no password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Max Reviewers (optional)</label>
                <input
                  className="field"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={maxReviewers}
                  onChange={(event) => setMaxReviewers(event.target.value)}
                />
              </div>

              <div>
                <label className="field-label">People to Send Review Link</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    className="field"
                    value={knownReviewerPick}
                    onChange={(event) => setKnownReviewerPick(event.target.value)}
                  >
                    <option value="">Select previous reviewer</option>
                    {knownReviewers.map((reviewer) => (
                      <option key={reviewer.email} value={reviewer.email}>
                        {reviewer.name} ({reviewer.email})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ width: 90 }}
                    onClick={() => {
                      const reviewer = knownReviewers.find((item) => item.email === knownReviewerPick);
                      if (!reviewer) return;
                      addReviewer(reviewer);
                      setKnownReviewerPick('');
                    }}
                  >
                    Add
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 10 }}>
                  <input
                    className="field"
                    placeholder="Reviewer name"
                    value={newReviewerName}
                    onChange={(event) => setNewReviewerName(event.target.value)}
                  />
                  <input
                    className="field"
                    type="email"
                    placeholder="reviewer@email.com"
                    value={newReviewerEmail}
                    onChange={(event) => setNewReviewerEmail(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ width: 90 }}
                    onClick={() => {
                      addReviewer({ name: newReviewerName, email: newReviewerEmail });
                      setNewReviewerName('');
                      setNewReviewerEmail('');
                    }}
                  >
                    Add
                  </button>
                </div>

                {expectedReviewers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {expectedReviewers.map((reviewer) => (
                      <button
                        key={reviewer.email}
                        type="button"
                        className="btn-ghost"
                        style={{ width: 'auto', padding: '8px 10px', fontSize: 12 }}
                        onClick={() => setExpectedReviewers((prev) => prev.filter((item) => item.email !== reviewer.email))}
                      >
                        {reviewer.name} | {reviewer.email} x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="btn-accent"
                disabled={!clientName.trim() || !projectName.trim()}
                onClick={() => setStep(2)}
                style={{ marginTop: 8 }}
              >
                {uploadMode === 'bulk' ? 'Next: Bulk Upload' : 'Next: Platform Upload'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="glass-panel" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
                {uploadMode === 'bulk' ? 'Bulk Upload' : 'Platform Upload'}
              </h3>
              <div className="template-total-box">TOTAL UPLOAD: {currentUploads.length}</div>

              {uploadMode === 'bulk' ? (
                <>
                  <div className="bulk-storage-box">
                    <div className="bulk-storage-row"><span>Storage Used</span><strong>{formatBytes(usedStorage)}</strong></div>
                    <div className="bulk-storage-row"><span>This Upload</span><strong style={{ color: isOverAccountLimit ? 'var(--fail)' : 'inherit' }}>{formatBytes(totalUploadBytes)}</strong></div>
                    <div className="bulk-storage-row"><span>Account Limit</span><strong>500.0 MB</strong></div>
                    <div className="storage-stack-bar-container">
                      <div className="storage-stack-used" style={{ width: `${Math.min(100, (usedStorage / (500 * 1024 * 1024)) * 100)}%`, background: 'var(--sub)' }} />
                      <div className="storage-stack-current" style={{ width: `${Math.min(100 - (usedStorage / (500 * 1024 * 1024)) * 100, (totalUploadBytes / (500 * 1024 * 1024)) * 100)}%`, background: isOverAccountLimit ? 'var(--fail)' : 'var(--accent)' }} />
                    </div>
                  </div>
                  <div
                    className={`bulk-dropzone${isDragging ? ' bulk-dropzone-active' : ''}`}
                    onClick={() => bulkInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); }}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleBulkFileChange(e.dataTransfer.files); }}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') bulkInputRef.current?.click(); }}
                    aria-label="Upload files"
                  >
                    <input ref={bulkInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(event) => handleBulkFileChange(event.target.files)} />
                    <div className="bulk-dropzone-icon" style={{ fontSize: isDragging ? 36 : 28, transition: 'font-size 0.2s' }}>
                      {isDragging ? '📂' : '☁'}
                    </div>
                    <div className="bulk-dropzone-title">{isDragging ? 'Drop files here!' : 'Drag & drop or click to upload'}</div>
                    <div className="bulk-dropzone-copy">Images &amp; videos supported • Multiple files at once</div>
                  </div>
                  <div className="bulk-preview-grid">
                    {bulkFiles.length === 0 ? (
                      <div className="template-preview-item" style={{ color: 'var(--sub)', fontSize: 12 }}>Upload files to see previews.</div>
                    ) : (
                        bulkFiles.map((file, index) => (
                          <div key={file.id} className="bulk-preview-card template-preview-shell">
                            <button type="button" className="template-preview-remove" aria-label={`Delete ${file.fileName}`} onClick={() => removeBulkFile(file.id)}>
                              <PreviewIcon kind="trash" size={14} stroke="currentColor" />
                            </button>
                            <div className="bulk-preview-media" style={{ position: 'relative' }}>
                              {String(file.contentType || '').startsWith('video/') ? (
                                <>
                                  <video src={file.preview} muted playsInline preload="metadata" style={{ width: '100%', display: 'block' }} />
                                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(0,0,0,0.55)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                    <PreviewIcon kind="play" size={16} stroke="#fff" fill="#fff" />
                                  </div>
                                  <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4 }}>VIDEO</div>
                                </>
                              ) : (
                                <img src={file.preview} alt={file.fileName} />
                              )}
                            </div>
                            <div className="bulk-preview-meta" style={{ padding: '5px 6px' }}>
                              <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.fileName}>
                                {file.fileName}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2 }}>
                                {formatBytes(file.file?.size || 0)}
                              </div>
                            </div>
                          </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {platformRows.map((row, rowIndex) => (
                      <div key={row.id} className="template-preview-card">
                        <div className="template-row-grid">
                          <div className="template-row-index">{rowIndex + 1}</div>
                          <label className="template-upload-box">
                            <input type="file" accept={selectedLayout === 'YouTube' ? 'video/*,image/*' : 'image/*,video/*'} multiple hidden onChange={(event) => handlePlatformFileChange(rowIndex, event.target.files)} />
                            {row.file ? 'Replace' : 'Upload'}
                          </label>
                          <textarea
                            className="template-text-box"
                            placeholder="Add caption"
                            value={row.text}
                            onChange={(event) => setPlatformRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, text: event.target.value } : item)))}
                          />
                        </div>
                        <div className="template-row-preview-grid">
                          {row.file ? (
                              <div className="template-preview-item template-preview-shell">
                                <div className="template-preview-head">
                                  <div className="template-preview-label">Preview</div>
                                  <button type="button" className="template-preview-remove" aria-label={`Delete row ${rowIndex + 1}`} onClick={() => removePlatformRow(row.id)}>
                                    <PreviewIcon kind="trash" size={14} stroke="currentColor" />
                                  </button>
                                </div>
                                <div className="template-preview-frame">
                                  {renderPlatformPreview(row)}
                              </div>
                            </div>
                          ) : (
                            <div className="template-preview-item" style={{ color: 'var(--sub)', fontSize: 12 }}>Upload media to see preview.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn-secondary" onClick={addPlatformRow} style={{ marginTop: 14, width: '100%' }}>+ Add Upload Row</button>
                </>
              )}
            </div>

            {error && <div className="error-box">{error}</div>}

            <button className="btn-accent" disabled={loading || currentUploads.length === 0 || isOverAccountLimit} onClick={handleCreate}>
              {loading ? 'Creating session...' : `Create Session with ${currentUploads.length} Upload${currentUploads.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {step === 3 && createdSession && (
          <div className="fade-in" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
            <div className="complete-icon-badge" aria-hidden="true"><span className="complete-icon-glyph" /></div>
            <h3 style={{ fontSize: 22, fontWeight: 800 }}>{createdSession.title}</h3>
            <p style={{ color: 'var(--sub)', fontSize: 14 }}>Share this link with your reviewers:</p>
            <div className="share-link-box" style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
              <input className="share-link-url" type="text" readOnly value={reviewUrl} onFocus={(event) => event.target.select()} style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
              <button onClick={copyLink} style={{ flexShrink: 0 }}>{copied ? 'Copied' : 'Copy Link'}</button>
            </div>
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button className="btn-ghost" onClick={() => navigate(`/sessions/${createdSession.id}`)} style={{ flex: 1, padding: '14px 0' }}>View Results</button>
              <button className="btn-accent" onClick={() => navigate('/')} style={{ flex: 1 }}>Dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
