import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import RoleFlowToggle from '../components/RoleFlowToggle';

const SOCIAL_CHANNELS = ['LinkedIn', 'Instagram', 'YouTube'];

const makeTemplateRows = (channel = 'LinkedIn') => [
  { id: 1, channel, files: [], text: '' },
];

export default function CreateSession() {
  const navigate = useNavigate();
  const [selectedLayout, setSelectedLayout] = useState('LinkedIn');
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [clientChoice, setClientChoice] = useState('other');
  const [projectChoice, setProjectChoice] = useState('other');
  const [deadline, setDeadline] = useState('');
  const [password, setPassword] = useState('');
  const [maxReviewers, setMaxReviewers] = useState('');
  const [historySessions, setHistorySessions] = useState([]);
  const [expectedReviewers, setExpectedReviewers] = useState([]);
  const [knownReviewerPick, setKnownReviewerPick] = useState('');
  const [newReviewerName, setNewReviewerName] = useState('');
  const [newReviewerEmail, setNewReviewerEmail] = useState('');
  const [images, setImages] = useState([]);
  const [templateRows, setTemplateRows] = useState(makeTemplateRows('LinkedIn'));
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdSession, setCreatedSession] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activePreviewRow, setActivePreviewRow] = useState(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    api
      .listSessions()
      .then((data) => {
        if (mounted) setHistorySessions(data.sessions || []);
      })
      .catch(() => {
        if (mounted) setHistorySessions([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const addReviewer = (reviewer) => {
    const email = String(reviewer?.email || '').toLowerCase().trim();
    const name = String(reviewer?.name || '').trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return;

    setExpectedReviewers((prev) => {
      if (prev.some((item) => item.email === email)) return prev;
      return [...prev, { email, name: name || email.split('@')[0] }];
    });
  };

  const removeReviewer = (email) => {
    setExpectedReviewers((prev) => prev.filter((item) => item.email !== email));
  };

  const clientCatalog = useMemo(() => {
    const map = new Map();
    historySessions.forEach((session) => {
      const clientId = session.clientId || `client-${(session.clientName || '').toLowerCase()}`;
      const clientNameValue = String(session.clientName || '').trim();
      if (!clientNameValue) return;

      if (!map.has(clientId)) {
        map.set(clientId, {
          id: clientId,
          name: clientNameValue,
          projects: new Map(),
          reviewers: new Map(),
        });
      }

      const current = map.get(clientId);
      if (session.projectId && session.projectName) {
        current.projects.set(session.projectId, { id: session.projectId, name: session.projectName });
      }

      (session.reviewerProgress || []).forEach((reviewer) => {
        const email = String(reviewer.email || '').toLowerCase().trim();
        const name = String(reviewer.name || '').trim();
        if (!email) return;
        current.reviewers.set(email, { email, name: name || email.split('@')[0] });
      });
    });

    return Array.from(map.values())
      .map((client) => ({
        ...client,
        projects: Array.from(client.projects.values()).sort((a, b) => a.name.localeCompare(b.name)),
        reviewers: Array.from(client.reviewers.values()).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [historySessions]);

  const selectedClient = useMemo(
    () => clientCatalog.find((client) => client.id === clientChoice) || null,
    [clientCatalog, clientChoice]
  );

  const projectOptions = selectedClient?.projects || [];
  const hasPreviousClients = clientCatalog.length > 0;
  const hasPreviousProjects = projectOptions.length > 0;
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
    if (project) {
      setProjectName(project.name);
    }
  }, [projectChoice, projectOptions]);

  const readFileAsBase64 = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const full = reader.result || '';
        const base64 = typeof full === 'string' ? full.split(',')[1] : '';
        resolve({
          fileName: file.name,
          data: base64,
          contentType: file.type || 'application/octet-stream',
          preview: full,
        });
      };
      reader.readAsDataURL(file);
    });

  const totalUploaded = templateRows.reduce((sum, row) => sum + row.files.length, 0);

  const syncImagesFromRows = (rows) => {
    const flattened = rows.flatMap((row, rowIndex) =>
      row.files.map((file, fileIndex) => ({
        fileName: `${row.channel}_${rowIndex + 1}_${fileIndex + 1}_${file.fileName}`,
        data: file.data,
        contentType: file.contentType,
        templateChannel: row.channel,
        templateText: row.text || '',
        rowId: row.id,
        rowOrder: rowIndex + 1,
      }))
    );
    setImages(flattened);
  };

  const onRowFileChange = async (rowIndex, fileList) => {
    const files = Array.from(fileList || []);
    const converted = await Promise.all(files.map((file) => readFileAsBase64(file)));
    const updated = templateRows.map((row, idx) =>
      idx === rowIndex ? { ...row, files: converted } : row
    );
    setTemplateRows(updated);
    syncImagesFromRows(updated);
  };

  const onRowTextChange = (rowIndex, value) => {
    setTemplateRows((prev) => {
      const updated = prev.map((row, idx) => (idx === rowIndex ? { ...row, text: value } : row));
      syncImagesFromRows(updated);
      return updated;
    });
  };

  const onLayoutChange = (layout) => {
    setSelectedLayout(layout);
    const updated = templateRows.map((row) => ({ ...row, channel: layout }));
    setTemplateRows(updated);
    syncImagesFromRows(updated);
  };

  const addTemplateRow = () => {
    const nextId = templateRows.length > 0 ? Math.max(...templateRows.map((row) => row.id)) + 1 : 1;
    const updated = [...templateRows, { id: nextId, channel: selectedLayout, files: [], text: '' }];
    setTemplateRows(updated);
    syncImagesFromRows(updated);
  };

  const removeTemplateRow = (rowIndex) => {
    if (templateRows.length <= 1) return;
    const updated = templateRows.filter((_, idx) => idx !== rowIndex);
    setTemplateRows(updated);
    syncImagesFromRows(updated);
  };

  const openRowPreview = (rowIndex, imageIndex = 0) => {
    setActivePreviewRow(rowIndex);
    setActivePreviewIndex(imageIndex);
  };

  const closeRowPreview = () => {
    setActivePreviewRow(null);
    setActivePreviewIndex(0);
  };

  const currentPreviewRow =
    activePreviewRow !== null && templateRows[activePreviewRow] ? templateRows[activePreviewRow] : null;

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

      if (images.length > 0) {
        await api.uploadImages(session.id, images.map((img) => ({
          fileName: img.fileName,
          data: img.data,
          contentType: img.contentType,
          templateChannel: img.templateChannel,
          templateText: img.templateText,
          rowId: img.rowId,
          rowOrder: img.rowOrder,
        })));
      }

      setCreatedSession(session);
      setStep(3);
    } catch (err) {
      setError(err.message || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const reviewUrl = createdSession ? api.getPublicReviewUrl(createdSession.id) : '';

  const renderPlatformPreview = (channel, row) => {
    const media = row.files[0] || null;
    const isVideo = media?.contentType?.startsWith('video/');

    if (channel === 'Instagram') {
      return (
        <div className="platform-card ig-card">
          <div className="ig-top">
            <div className="ig-avatar" />
            <div>
              <div className="ig-name">{projectName || 'project_account'}</div>
              <div className="ig-meta">{clientName || 'Client'}</div>
            </div>
          </div>
          <div className="ig-media">
            {media ? (
              isVideo ? <video src={media.preview} controls muted playsInline /> : <img src={media.preview} alt={media.fileName} />
            ) : (
              <div className="social-preview-media-empty">Upload media for Instagram preview</div>
            )}
          </div>
          <div className="ig-bottom">
            <div className="ig-actions">♡  💬  ✈  ⌲</div>
            <div className="ig-caption">{row.text || 'Write your Instagram caption here...'}</div>
          </div>
        </div>
      );
    }

    if (channel === 'LinkedIn') {
      return (
        <div className="platform-card li-card">
          <div className="li-top">
            <div className="li-avatar" />
            <div>
              <div className="li-company">{clientName || 'Client Company'}</div>
              <div className="li-meta">Project: {projectName || 'Project'} • just now</div>
            </div>
          </div>
          <div className="li-copy">{row.text || 'Draft your LinkedIn post content for this campaign...'}</div>
          <div className="li-media">
            {media ? (
              isVideo ? <video src={media.preview} controls muted playsInline /> : <img src={media.preview} alt={media.fileName} />
            ) : (
              <div className="social-preview-media-empty">Upload image/media for LinkedIn preview</div>
            )}
          </div>
          <div className="li-actions">
            <span>Like</span><span>Comment</span><span>Repost</span><span>Send</span>
          </div>
        </div>
      );
    }

    return (
      <div className="platform-card yt-card">
        <div className="yt-media">
          {media ? (
            isVideo ? <video src={media.preview} controls muted playsInline /> : <img src={media.preview} alt={media.fileName} />
          ) : (
            <div className="social-preview-media-empty">Upload video for YouTube preview</div>
          )}
        </div>
        <div className="yt-content">
          <div className="yt-title">{row.text || `${projectName || 'Project'} - YouTube video title`}</div>
          <div className="yt-meta">{clientName || 'Client Channel'} • Preview</div>
        </div>
      </div>
    );
  };

  const copyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(reviewUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = reviewUrl;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // If all else fails, select the text so user can manually copy
      const input = document.querySelector('.share-link-url');
      if (input) { input.focus(); input.select(); }
    }
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <div className="header-bar">
        <button
          className="btn-ghost"
          onClick={() => {
            if (step > 1 && !createdSession) setStep(step - 1);
            else navigate('/');
          }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>
          {step === 3 ? '🎉 Session Created!' : 'New Review Session'}
        </h2>
        <div style={{ width: 64 }} />
      </div>

      <div className="fade-in" style={{ marginBottom: 10 }}>
        <RoleFlowToggle active="sender" senderPath="/" receiverPath="/reviewer" />
      </div>

      {/* Step indicator */}
      {step < 3 && (
        <div className="step-indicator fade-in">
          {[1, 2].map((s) => (
            <div key={s} className={`step-dot${s <= step ? ' step-dot-active' : ''}`} />
          ))}
        </div>
      )}

      <div style={{ maxWidth: 520, margin: '0 auto', width: '100%' }}>
        {/* Step 1: Session Info */}
        {step === 1 && (
          <div className="glass-panel fade-in" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24 }}>Session Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="field-label">Client *</label>
                {hasPreviousClients && (
                  <select
                    className="field"
                    value={clientChoice}
                    onChange={(e) => {
                      const value = e.target.value;
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
                )}

                {(!hasPreviousClients || clientChoice === 'other') && (
                  <input
                    className="field"
                    style={{ marginTop: hasPreviousClients ? 10 : 0 }}
                    placeholder="e.g., Panda Media"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                )}
              </div>

              <div>
                <label className="field-label">Project *</label>
                {hasPreviousProjects && (
                  <select
                    className="field"
                    value={projectChoice}
                    onChange={(e) => {
                      const value = e.target.value;
                      setProjectChoice(value);
                      if (value === 'other') {
                        setProjectName('');
                      }
                    }}
                  >
                    <option value="other">New Project</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                )}

                {(!hasPreviousProjects || projectChoice === 'other') && (
                  <input
                    className="field"
                    style={{ marginTop: hasPreviousProjects ? 10 : 0 }}
                    placeholder="e.g., Spring Social Campaign"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                )}
              </div>

              <div>
                <label className="field-label">Platform Layout *</label>
                <div className="layout-switch" style={{ marginTop: 8 }}>
                  {SOCIAL_CHANNELS.map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => onLayoutChange(channel)}
                      className={`layout-switch-btn ${selectedLayout === channel ? 'layout-switch-btn-active' : ''}`}
                    >
                      {channel}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label">Deadline (optional)</label>
                <input
                  className="field"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="field-label">Password Protection (optional)</label>
                <input
                  className="field"
                  type="text"
                  placeholder="Leave blank for no password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Max Reviewers (optional)</label>
                <input
                  className="field"
                  type="number"
                  placeholder="Unlimited"
                  min="1"
                  value={maxReviewers}
                  onChange={(e) => setMaxReviewers(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">People to Send Review Link</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    className="field"
                    value={knownReviewerPick}
                    onChange={(e) => setKnownReviewerPick(e.target.value)}
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
                    onChange={(e) => setNewReviewerName(e.target.value)}
                  />
                  <input
                    className="field"
                    type="email"
                    placeholder="reviewer@email.com"
                    value={newReviewerEmail}
                    onChange={(e) => setNewReviewerEmail(e.target.value)}
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
                        onClick={() => removeReviewer(reviewer.email)}
                        title="Remove reviewer"
                      >
                        {reviewer.name} · {reviewer.email} ✕
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
                Next: Template Upload →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Template Upload */}
        {step === 2 && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="glass-panel" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Template Upload</h3>

              <div className="template-total-box">
                TOTAL UPLOAD: {totalUploaded}
              </div>

              <div style={{ marginBottom: 14, color: 'var(--sub)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Layout: {selectedLayout}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {templateRows.map((row, rowIndex) => (
                  <div key={row.id} className="template-preview-card">
                    <div className="template-row-grid">
                      <div className="template-row-index">{rowIndex + 1}</div>

                      <label className="template-upload-box">
                        <input
                          type="file"
                          accept={selectedLayout === 'YouTube' ? 'video/*,image/*' : 'image/*'}
                          multiple
                          style={{ display: 'none' }}
                          onChange={(e) => onRowFileChange(rowIndex, e.target.files)}
                        />
                        {row.files.length > 0 ? `${row.files.length} FILE` : 'UPLOAD'}
                      </label>

                      <textarea
                        className="template-text-box"
                        placeholder={selectedLayout === 'YouTube' ? 'VIDEO CAPTION / TEXT' : 'POST TEXT'}
                        value={row.text}
                        onChange={(e) => onRowTextChange(rowIndex, e.target.value)}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 8, fontWeight: 700, letterSpacing: '0.08em' }}>
                        PREVIEW
                      </div>
                      <div className="template-row-preview-grid">
                        {row.files.length > 0 ? (
                          row.files.map((file, fileIndex) => (
                            <button
                              type="button"
                              key={`${row.id}-${file.fileName}-${fileIndex}`}
                              className="template-preview-item template-preview-btn"
                              onClick={() => openRowPreview(rowIndex, fileIndex)}
                            >
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sub)', marginBottom: 6 }}>
                                {selectedLayout.toUpperCase()} PREVIEW {fileIndex + 1}
                              </div>
                              {renderPlatformPreview(selectedLayout, {
                                ...row,
                                files: [file],
                              })}
                            </button>
                          ))
                        ) : (
                          <div className="template-preview-item" style={{ color: 'var(--sub)', fontSize: 12 }}>
                            Upload media to see preview.
                          </div>
                        )}
                      </div>
                    </div>

                    {templateRows.length > 1 && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => removeTemplateRow(rowIndex)}
                        style={{ alignSelf: 'flex-end', width: 'auto', padding: '8px 10px', fontSize: 12 }}
                      >
                        Remove Row
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={addTemplateRow}
                style={{ marginTop: 14, width: '100%' }}
              >
                + Add Upload Row
              </button>
            </div>

            {error && <div className="error-box">{error}</div>}

            <button
              className="btn-accent"
              disabled={loading || images.length === 0}
              onClick={handleCreate}
            >
              {loading ? 'Creating Session…' : `Create Session with ${images.length} Upload${images.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && createdSession && (
          <div className="fade-in" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
            <div className="complete-emoji">🎉</div>

            <h3 style={{ fontSize: 22, fontWeight: 800 }}>{createdSession.title}</h3>
            <p style={{ color: 'var(--sub)', fontSize: 14 }}>
              Share this link with your reviewers:
            </p>

            <div className="share-link-box" style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
              <input
                className="share-link-url"
                type="text"
                readOnly
                value={reviewUrl}
                onFocus={(e) => e.target.select()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  wordBreak: 'normal',
                  overflowWrap: 'normal',
                }}
              />
              <button onClick={copyLink} style={{ flexShrink: 0 }}>{copied ? '\u2713 Copied' : 'Copy Link'}</button>
            </div>

            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button
                className="btn-ghost"
                onClick={() => navigate(`/sessions/${createdSession.id}`)}
                style={{ flex: 1, padding: '14px 0' }}
              >
                View Results
              </button>
              <button
                className="btn-accent"
                onClick={() => navigate('/')}
                style={{ flex: 1 }}
              >
                Dashboard
              </button>
            </div>
          </div>
        )}

        {currentPreviewRow && (
          <div className="template-preview-modal-overlay" onClick={closeRowPreview}>
            <div className="template-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="template-preview-modal-header">
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {currentPreviewRow.channel} · Row {currentPreviewRow.id}
                </div>
                <button type="button" className="btn-ghost" style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }} onClick={closeRowPreview}>
                  Close
                </button>
              </div>

              <div className="template-preview-modal-body">
                {currentPreviewRow.files.length > 0 &&
                  renderPlatformPreview(currentPreviewRow.channel, {
                    ...currentPreviewRow,
                    files: [currentPreviewRow.files[activePreviewIndex]],
                  })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ width: 'auto', padding: '8px 10px', fontSize: 12 }}
                  onClick={() =>
                    setActivePreviewIndex((prev) =>
                      Math.max(0, prev - 1)
                    )
                  }
                  disabled={activePreviewIndex <= 0}
                >
                  ← Previous
                </button>
                <div style={{ fontSize: 12, color: 'var(--sub)' }}>
                  {activePreviewIndex + 1} / {currentPreviewRow.files.length}
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ width: 'auto', padding: '8px 10px', fontSize: 12 }}
                  onClick={() =>
                    setActivePreviewIndex((prev) =>
                      Math.min(currentPreviewRow.files.length - 1, prev + 1)
                    )
                  }
                  disabled={activePreviewIndex >= currentPreviewRow.files.length - 1}
                >
                  Next →
                </button>
              </div>

              <div className="template-preview-modal-strip">
                {currentPreviewRow.files.map((file, index) => (
                  <button
                    type="button"
                    key={`${file.fileName}-${index}`}
                    className={`template-preview-thumb ${index === activePreviewIndex ? 'template-preview-thumb-active' : ''}`}
                    onClick={() => setActivePreviewIndex(index)}
                  >
                    {file.contentType?.startsWith('video/') ? (
                      <video src={file.preview} muted playsInline />
                    ) : (
                      <img src={file.preview} alt={file.fileName} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
