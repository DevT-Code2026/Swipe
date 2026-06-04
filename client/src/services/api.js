const API_BASE = '/api';
const PUBLIC_APP_ORIGIN = (import.meta.env?.VITE_PUBLIC_APP_ORIGIN || 'https://giggidy.work').replace(/\/$/, '');

class ApiService {
  constructor() {
    this.creatorToken = localStorage.getItem('creatorToken') || null;
    this.reviewerToken = sessionStorage.getItem('reviewerToken') || null;
    this.reviewerAccountToken = localStorage.getItem('reviewerAccountToken') || null;
  }

  setCreatorToken(token) {
    this.creatorToken = token;
    if (token) {
      localStorage.setItem('creatorToken', token);
    } else {
      localStorage.removeItem('creatorToken');
    }
  }

  setReviewerToken(token) {
    this.reviewerToken = token;
    if (token) {
      sessionStorage.setItem('reviewerToken', token);
    } else {
      sessionStorage.removeItem('reviewerToken');
    }
  }

  setReviewerAccountToken(token) {
    this.reviewerAccountToken = token;
    if (token) {
      localStorage.setItem('reviewerAccountToken', token);
    } else {
      localStorage.removeItem('reviewerAccountToken');
    }
  }

  async request(method, path, body = null, useReviewerToken = false, useReviewerAccountToken = false) {
    const headers = { 'Content-Type': 'application/json' };
    const token = useReviewerToken
      ? this.reviewerToken
      : useReviewerAccountToken
        ? this.reviewerAccountToken
        : this.creatorToken;

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, options);
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || 'Request failed');
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response;
  }

  // ── Auth ──
  async register(email, password, name) {
    const data = await this.request('POST', '/auth/register', { email, password, name });
    this.setCreatorToken(data.token);
    return data;
  }

  async login(email, password) {
    const data = await this.request('POST', '/auth/login', { email, password });
    this.setCreatorToken(data.token);
    return data;
  }

  async getMe() {
    return this.request('GET', '/auth/me');
  }

  logout() {
    this.setCreatorToken(null);
    this.setReviewerToken(null);
    this.setReviewerAccountToken(null);
  }

  // ── Sessions (Creator) ──
  async createSession(title, options = {}) {
    return this.request('POST', '/sessions', { title, ...options });
  }

  async listSessions() {
    return this.request('GET', '/sessions');
  }

  async getSession(id) {
    return this.request('GET', `/sessions/${id}`);
  }

  async updateSession(id, updates) {
    return this.request('PATCH', `/sessions/${id}`, updates);
  }

  async deleteSession(id) {
    return this.request('DELETE', `/sessions/${id}`);
  }

  async deleteAllSessions() {
    return this.request('DELETE', '/sessions');
  }

  async deleteSessionsByClient(clientId) {
    return this.request('DELETE', `/sessions?scope=client&clientId=${encodeURIComponent(clientId)}`);
  }

  async deleteSessionsByProject(projectId) {
    return this.request('DELETE', `/sessions?scope=project&projectId=${encodeURIComponent(projectId)}`);
  }

  async deleteSessionsByScope(scope) {
    if (scope === 'all') {
      return this.request('DELETE', '/sessions?scope=all');
    }
    throw new Error('Unsupported delete scope');
  }

  getPublicReviewUrl(sessionId) {
    return `${PUBLIC_APP_ORIGIN}/r/${sessionId}`;
  }

  // ── Images (Creator) ──
  async uploadImages(sessionId, images) {
    // images: [{fileName, data (base64), contentType}]
    return this.request('POST', `/sessions/${sessionId}/images`, { images });
  }

  async getSessionImages(sessionId, asReviewer = false) {
    return this.request('GET', `/sessions/${sessionId}/images`, null, asReviewer);
  }

  async getPublicSessionPreview(sessionId) {
    return this.request('GET', `/public/sessions/${sessionId}/preview`);
  }

  async deleteImage(sessionId, imageId) {
    return this.request('DELETE', `/sessions/${sessionId}/images/${imageId}`);
  }

  // ── Reviewer ──
  async joinSession(sessionId, reviewerName, reviewerEmail, password = null) {
    const data = await this.request('POST', `/sessions/${sessionId}/join`, {
      reviewerName,
      reviewerEmail,
      password,
    }, false, !!this.reviewerAccountToken);
    this.setReviewerToken(data.token);
    return data;
  }

  async submitReview(sessionId, decisions, annotations = []) {
    return this.request(
      'POST',
      `/sessions/${sessionId}/submit`,
      { decisions, annotations },
      true
    );
  }

  async getReviewerProjectHistory(sessionId) {
    return this.request('GET', `/sessions/${sessionId}/reviewer-history`, null, true);
  }

  // ── Reviewer Account ──
  async reviewerRegister(name, email, password) {
    const data = await this.request('POST', '/reviewer/register', { name, email, password });
    this.setReviewerAccountToken(data.token);
    return data;
  }

  async reviewerLogin(email, password) {
    const data = await this.request('POST', '/reviewer/login', { email, password });
    this.setReviewerAccountToken(data.token);
    return data;
  }

  async getReviewerMe() {
    return this.request('GET', '/reviewer/me', null, false, true);
  }

  async claimReviewerSession(sessionId) {
    return this.request('POST', `/reviewer/sessions/${sessionId}/claim`, {}, false, true);
  }

  async listReviewerSessions() {
    return this.request('GET', '/reviewer/sessions', null, false, true);
  }

  async getReviewerSessionHistory(sessionId) {
    return this.request('GET', `/reviewer/sessions/${sessionId}/history`, null, false, true);
  }

  // ── Export ──
  async exportSession(sessionId, format = 'xlsx') {
    const token = this.creatorToken;
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/export?format=${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error('Export failed');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-results.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const api = new ApiService();
export default api;
