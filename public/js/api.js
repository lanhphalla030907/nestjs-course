/**
 * TaskFlow Pro API Client
 * Robust, interceptable HTTP client with automated JWT attachment and live telemetry
 */

class ApiService {
  constructor() {
    // Auto-detect base API URL:
    // If hosted by NestJS or on localhost:3200, use relative path, otherwise default to http://localhost:3200
    const currentOrigin = window.location.origin;
    if (currentOrigin.includes(':3200')) {
      this.baseUrl = '';
    } else {
      this.baseUrl = localStorage.getItem('taskflow_api_base') || 'http://localhost:3200';
    }

    this.token = localStorage.getItem('taskflow_token') || null;
    this.user = JSON.parse(localStorage.getItem('taskflow_user') || 'null');
    this.networkLogs = [];
    this.listeners = [];
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, '');
    localStorage.setItem('taskflow_api_base', this.baseUrl);
  }

  setSession(token, user) {
    this.token = token;
    this.user = user;
    if (token) {
      localStorage.setItem('taskflow_token', token);
      localStorage.setItem('taskflow_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('taskflow_token');
      localStorage.removeItem('taskflow_user');
    }
    this.notifySessionChange();
  }

  clearSession() {
    this.setSession(null, null);
  }

  onSessionChange(callback) {
    this.sessionListeners = this.sessionListeners || [];
    this.sessionListeners.push(callback);
  }

  notifySessionChange() {
    if (this.sessionListeners) {
      this.sessionListeners.forEach(cb => cb(this.user, this.token));
    }
  }

  onNetworkLog(callback) {
    this.listeners.push(callback);
  }

  notifyLog(logEntry) {
    this.networkLogs.unshift(logEntry);
    if (this.networkLogs.length > 100) this.networkLogs.pop();
    this.listeners.forEach(cb => cb(logEntry, this.networkLogs));
  }

  async request(endpoint, options = {}) {
    const startTime = performance.now();
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };

    if (this.token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let requestBody = null;
    if (options.body && typeof options.body === 'object') {
      requestBody = options.body;
      options.body = JSON.stringify(options.body);
    }

    let response;
    let data;
    let error = null;
    let status = 0;

    try {
      response = await fetch(url, {
        ...options,
        headers,
      });

      status = response.status;
      const text = await response.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }

      if (!response.ok) {
        // Build detailed error message
        const errMsg = data.message || (data.errors ? data.errors.join(', ') : 'Request failed');
        const err = new Error(errMsg);
        err.status = status;
        err.data = data;
        error = err;
        throw err;
      }

      return data;
    } catch (err) {
      error = err;
      throw err;
    } finally {
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      const logItem = {
        id: Math.random().toString(36).substring(2, 9),
        method: options.method || 'GET',
        endpoint,
        fullUrl: url,
        status: status || 0,
        latency,
        timestamp: new Date().toLocaleTimeString(),
        requestBody,
        responseData: data || { error: error?.message || 'Network / CORS Error' },
        success: !error,
      };

      this.notifyLog(logItem);
    }
  }

  /* ================= Auth Endpoints ================= */
  async register({ name, email, password }) {
    const res = await this.request('/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
    return res;
  }

  async login({ email, password }) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    // Response structure from Nest TransformInterceptor:
    // res = { success: true, data: { accessToken, user, message } }
    const payload = res.data || res;
    if (payload.accessToken) {
      this.setSession(payload.accessToken, payload.user);
    }
    return payload;
  }

  /* ================= Tasks Endpoints ================= */
  async getTasks({ page = 1, limit = 10, completed, search, sortBy = 'createdAt', sortOrder = 'desc' } = {}) {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (completed !== undefined && completed !== 'all') params.append('completed', completed);
    if (search && search.trim() !== '') params.append('search', search.trim());
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`/tasks${queryString}`, { method: 'GET' });
    // TransformInterceptor format: { success: true, data: tasks[], meta: { page, limit, total, totalPages } }
    return {
      tasks: res.data || [],
      meta: res.meta || { page: 1, limit, total: (res.data || []).length, totalPages: 1 },
    };
  }

  async getTask(id) {
    const res = await this.request(`/tasks/${id}`, { method: 'GET' });
    return res.data || res;
  }

  async createTask({ title, description }) {
    const body = { title };
    if (description && description.trim() !== '') {
      body.description = description.trim();
    }
    const res = await this.request('/tasks', {
      method: 'POST',
      body,
    });
    return res.data || res;
  }

  async updateTask(id, { title, description, completed }) {
    const body = {};
    if (title !== undefined) body.title = title;
    if (description !== undefined) body.description = description;
    if (completed !== undefined) body.completed = completed;

    const res = await this.request(`/tasks/${id}`, {
      method: 'PATCH',
      body,
    });
    return res.data || res;
  }

  async deleteTask(id) {
    const res = await this.request(`/tasks/${id}`, {
      method: 'DELETE',
    });
    return res.data || res;
  }

  async adminTest() {
    return this.request('/tasks/admin-test', { method: 'GET' });
  }

  /* ================= Products Endpoints ================= */
  async getProducts() {
    const res = await this.request('/product', { method: 'GET' });
    return res.data || res || [];
  }

  async getProduct(id) {
    const res = await this.request(`/product/${id}`, { method: 'GET' });
    return res.data || res;
  }

  async createProduct({ name, price }) {
    const res = await this.request('/product', {
      method: 'POST',
      body: { name, price: Number(price) },
    });
    return res.data || res;
  }

  async updateProduct(id, { name, price }) {
    const body = {};
    if (name !== undefined) body.name = name;
    if (price !== undefined) body.price = Number(price);

    const res = await this.request(`/product/${id}`, {
      method: 'PATCH',
      body,
    });
    return res.data || res;
  }

  async deleteProduct(id) {
    const res = await this.request(`/product/${id}`, {
      method: 'DELETE',
    });
    return res.data || res;
  }

  /* ================= System / Health ================= */
  async ping() {
    const start = performance.now();
    try {
      const res = await this.request('/', { method: 'GET' });
      const latency = Math.round(performance.now() - start);
      return { ok: true, latency, data: res };
    } catch (err) {
      const latency = Math.round(performance.now() - start);
      return { ok: false, latency, error: err.message };
    }
  }
}

export const api = new ApiService();
