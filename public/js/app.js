/**
 * TaskFlow Pro - Unified Application & API Client
 * Built to execute flawlessly whether served from http://localhost:3200 or opened directly via file://
 */

(function () {
  'use strict';

  /* ==========================================================================
     API Client Layer
     ========================================================================== */
  class ApiService {
    constructor() {
      // Determine backend base URL:
      // If served directly from port 3200, relative paths work directly.
      // Otherwise (file://, port 5500, live-server, etc.), point to http://localhost:3200.
      const origin = window.location.origin;
      if (origin && origin.includes(':3200')) {
        this.baseUrl = '';
      } else {
        this.baseUrl = localStorage.getItem('taskflow_api_base') || 'http://localhost:3200';
      }

      this.token = localStorage.getItem('taskflow_token') || null;
      try {
        this.user = JSON.parse(localStorage.getItem('taskflow_user') || 'null');
      } catch (e) {
        this.user = null;
      }
      this.networkLogs = [];
      this.listeners = [];
      this.sessionListeners = [];
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
      this.sessionListeners.push(callback);
    }

    notifySessionChange() {
      this.sessionListeners.forEach((cb) => {
        try {
          cb(this.user, this.token);
        } catch (e) {
          console.error('Session listener error:', e);
        }
      });
    }

    onNetworkLog(callback) {
      this.listeners.push(callback);
    }

    notifyLog(logEntry) {
      this.networkLogs.unshift(logEntry);
      if (this.networkLogs.length > 100) this.networkLogs.pop();
      this.listeners.forEach((cb) => {
        try {
          cb(logEntry, this.networkLogs);
        } catch (e) {
          console.error('Log listener error:', e);
        }
      });
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
      let data = null;
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
        } catch (parseErr) {
          data = { raw: text };
        }

        if (!response.ok) {
          let errMsg = 'Request failed';
          if (data && data.message) {
            errMsg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
          } else if (data && data.errors) {
            errMsg = data.errors.join(', ');
          }
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
        const latency = Math.round(performance.now() - startTime);
        const logItem = {
          id: Math.random().toString(36).substring(2, 9),
          method: options.method || 'GET',
          endpoint,
          fullUrl: url,
          status: status || (error ? 500 : 200),
          latency,
          timestamp: new Date().toLocaleTimeString(),
          requestBody,
          responseData: data || { error: error?.message || 'Network / CORS Error' },
          success: !error,
        };
        this.notifyLog(logItem);
      }
    }

    /* Auth */
    async register({ name, email, password }) {
      return this.request('/auth/register', {
        method: 'POST',
        body: { name, email, password },
      });
    }

    async login({ email, password }) {
      const res = await this.request('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      const payload = res.data || res;
      if (payload.accessToken) {
        this.setSession(payload.accessToken, payload.user);
      }
      return payload;
    }

    /* Tasks */
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

    /* Products */
    async getProducts() {
      const res = await this.request('/product', { method: 'GET' });
      return res.data || res || [];
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

    /* Health */
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

  const api = new ApiService();

  /* ==========================================================================
     Application UI & Interactions Layer
     ========================================================================== */
  const state = {
    currentTab: 'tasks',
    tasks: [],
    tasksMeta: { page: 1, limit: 10, total: 0, totalPages: 1 },
    taskFilters: {
      page: 1,
      limit: 10,
      completed: 'all',
      search: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    products: [],
    productSearch: '',
    deleteTarget: null,
    activeTask: null,
    isPinging: false,
  };

  function getDom() {
    return {
      tabs: document.querySelectorAll('.nav-tab'),
      panes: document.querySelectorAll('.tab-pane'),
      tasksBadge: document.getElementById('tasks-count-badge'),
      productsBadge: document.getElementById('products-count-badge'),
      networkBadge: document.getElementById('network-count-badge'),

      apiHealthBtn: document.getElementById('api-health-btn'),
      statusDot: document.getElementById('status-dot'),
      statusLabel: document.getElementById('status-label'),
      latencyBadge: document.getElementById('latency-badge'),
      themeToggleBtn: document.getElementById('theme-toggle-btn'),
      userAuthZone: document.getElementById('user-auth-zone'),

      tasksAuthBanner: document.getElementById('tasks-auth-banner'),
      tasksAuthView: document.getElementById('tasks-authenticated-view'),
      bannerLoginBtn: document.getElementById('banner-login-btn'),
      bannerRegisterBtn: document.getElementById('banner-register-btn'),
      statTotal: document.getElementById('stat-total-tasks'),
      statCompleted: document.getElementById('stat-completed-tasks'),
      statPending: document.getElementById('stat-pending-tasks'),
      statRate: document.getElementById('stat-rate-tasks'),
      taskSearchInput: document.getElementById('task-search-input'),
      taskSearchClear: document.getElementById('task-search-clear'),
      filterPills: document.querySelectorAll('.filter-pill'),
      taskSortBy: document.getElementById('task-sort-by'),
      taskOrderToggle: document.getElementById('task-order-toggle'),
      orderIconDesc: document.getElementById('order-icon-desc'),
      orderIconAsc: document.getElementById('order-icon-asc'),
      taskLimitSelect: document.getElementById('task-limit-select'),
      openCreateTaskBtn: document.getElementById('open-create-task-btn'),
      emptyCreateTaskBtn: document.getElementById('empty-create-task-btn'),
      tasksLoading: document.getElementById('tasks-loading'),
      tasksList: document.getElementById('tasks-list'),
      tasksEmpty: document.getElementById('tasks-empty'),
      tasksPagination: document.getElementById('tasks-pagination'),
      paginationInfo: document.getElementById('pagination-info'),
      paginationControls: document.getElementById('pagination-controls'),

      openCreateProductBtn: document.getElementById('open-create-product-btn'),
      productSearchInput: document.getElementById('product-search-input'),
      productStatsBadge: document.getElementById('product-stats-badge'),
      productsLoading: document.getElementById('products-loading'),
      productsGrid: document.getElementById('products-grid'),

      adminTestUsername: document.getElementById('admin-test-username'),
      adminTestRole: document.getElementById('admin-test-role'),
      adminTestToken: document.getElementById('admin-test-token'),
      btnTriggerAdminTest: document.getElementById('btn-trigger-admin-test'),
      adminResponseBox: document.getElementById('admin-test-response-box'),
      adminResponseStatus: document.getElementById('admin-response-status'),
      adminResponseBody: document.getElementById('admin-response-body'),

      btnTestPing: document.getElementById('btn-test-ping'),
      btnClearInspector: document.getElementById('btn-clear-inspector'),
      inspectorTableBody: document.getElementById('inspector-table-body'),
      inspectorEmpty: document.getElementById('inspector-empty'),

      taskModal: document.getElementById('task-modal'),
      taskModalClose: document.getElementById('task-modal-close'),
      taskModalCancel: document.getElementById('task-modal-cancel'),
      taskModalForm: document.getElementById('task-modal-form'),
      taskModalTitle: document.getElementById('task-modal-title'),
      taskFormId: document.getElementById('task-form-id'),
      taskFormTitle: document.getElementById('task-form-title'),
      taskFormDesc: document.getElementById('task-form-desc'),
      taskTitleCount: document.getElementById('task-title-count'),
      taskDescCount: document.getElementById('task-desc-count'),
      taskFormCompletedGroup: document.getElementById('task-form-completed-group'),
      taskFormCompleted: document.getElementById('task-form-completed'),

      productModal: document.getElementById('product-modal'),
      productModalClose: document.getElementById('product-modal-close'),
      productModalCancel: document.getElementById('product-modal-cancel'),
      productModalForm: document.getElementById('product-modal-form'),
      productModalTitle: document.getElementById('product-modal-title'),
      productFormId: document.getElementById('product-form-id'),
      productFormName: document.getElementById('product-form-name'),
      productFormPrice: document.getElementById('product-form-price'),

      authModal: document.getElementById('auth-modal'),
      authModalClose: document.getElementById('auth-modal-close'),
      authTabLogin: document.getElementById('auth-tab-login'),
      authTabRegister: document.getElementById('auth-tab-register'),
      loginForm: document.getElementById('login-form'),
      loginModalCancel: document.getElementById('login-modal-cancel'),
      registerForm: document.getElementById('register-form'),
      regModalCancel: document.getElementById('reg-modal-cancel'),

      inspectorModal: document.getElementById('inspector-modal'),
      inspectorModalClose: document.getElementById('inspector-modal-close'),
      inspectorModalCloseBtn: document.getElementById('inspector-modal-close-btn'),
      inspReqMethod: document.getElementById('insp-req-method'),
      inspReqUrl: document.getElementById('insp-req-url'),
      inspReqBodyContainer: document.getElementById('insp-req-body-container'),
      inspReqBody: document.getElementById('insp-req-body'),
      inspResStatus: document.getElementById('insp-res-status'),
      inspResTime: document.getElementById('insp-res-time'),
      inspResBody: document.getElementById('insp-res-body'),

      confirmModal: document.getElementById('confirm-modal'),
      confirmModalClose: document.getElementById('confirm-modal-close'),
      confirmModalCancel: document.getElementById('confirm-modal-cancel'),
      confirmModalConfirm: document.getElementById('confirm-modal-confirm'),
      confirmModalMessage: document.getElementById('confirm-modal-message'),

      // Task Details Full View Modal
      taskDetailsModal: document.getElementById('task-details-modal'),
      taskDetailsClose: document.getElementById('task-details-close'),
      tdLoading: document.getElementById('td-loading'),
      tdContent: document.getElementById('td-content'),
      tdTaskId: document.getElementById('td-task-id'),
      tdTaskStatusBadge: document.getElementById('td-task-status-badge'),
      tdTaskTitle: document.getElementById('td-task-title'),
      tdTaskDesc: document.getElementById('td-task-desc'),
      tdCopyDescBtn: document.getElementById('td-copy-desc-btn'),
      tdTaskStatusText: document.getElementById('td-task-status-text'),
      tdTaskOwner: document.getElementById('td-task-owner'),
      tdTaskCreated: document.getElementById('td-task-created'),
      tdTaskUpdated: document.getElementById('td-task-updated'),
      tdBtnToggleStatus: document.getElementById('td-btn-toggle-status'),
      tdToggleStatusLabel: document.getElementById('td-toggle-status-label'),
      tdBtnDelete: document.getElementById('td-btn-delete'),
      tdBtnEdit: document.getElementById('td-btn-edit'),
      tdBtnClose: document.getElementById('td-btn-close'),

      toastContainer: document.getElementById('toast-container'),
    };
  }

  let dom = {};

  function showToast(message, type = 'info', duration = 3500) {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-msg">${escapeHtml(message)}</span>
    `;

    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = 'none';
    document.body.style.overflow = '';
  }

  function switchTab(tabName) {
    state.currentTab = tabName;
    dom.tabs.forEach((tab) => {
      const isActive = tab.getAttribute('data-tab') === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    dom.panes.forEach((pane) => {
      pane.classList.toggle('active', pane.id === `pane-${tabName}`);
    });

    if (tabName === 'tasks') {
      loadTasks();
    } else if (tabName === 'products') {
      loadProducts();
    } else if (tabName === 'admin') {
      updateAdminView();
    }
  }

  function updateAuthUI() {
    const user = api.user;
    const token = api.token;

    if (user && token) {
      const initials = (user.name || user.email || 'U').substring(0, 2).toUpperCase();
      const roleBadge = user.role || 'USER';

      dom.userAuthZone.innerHTML = `
        <div class="user-profile-badge">
          <div class="user-avatar">${initials}</div>
          <div class="user-details">
            <span class="user-name-text">${escapeHtml(user.name || user.email)}</span>
            <span class="user-role-pill">${escapeHtml(roleBadge)}</span>
          </div>
          <button class="btn-logout-small" id="btn-logout" title="Log Out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      `;

      const logoutBtn = document.getElementById('btn-logout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          api.clearSession();
          showToast('Logged out successfully', 'info');
          updateAuthUI();
          loadTasks();
        });
      }

      dom.tasksAuthBanner.style.display = 'none';
      dom.tasksAuthView.style.display = 'block';
    } else {
      dom.userAuthZone.innerHTML = `
        <button class="btn btn-primary" id="btn-open-auth">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          <span>Sign In</span>
        </button>
      `;

      const openAuthBtn = document.getElementById('btn-open-auth');
      if (openAuthBtn) {
        openAuthBtn.addEventListener('click', () => openAuthModal('login'));
      }

      dom.tasksAuthBanner.style.display = 'block';
      dom.tasksAuthView.style.display = 'none';
    }

    updateAdminView();
  }

  function openAuthModal(mode = 'login') {
    if (mode === 'login') {
      dom.authTabLogin.classList.add('active');
      dom.authTabRegister.classList.remove('active');
      dom.loginForm.style.display = 'block';
      dom.registerForm.style.display = 'none';
    } else {
      dom.authTabLogin.classList.remove('active');
      dom.authTabRegister.classList.add('active');
      dom.loginForm.style.display = 'none';
      dom.registerForm.style.display = 'block';
    }
    openModal(dom.authModal);
  }

  /* Tasks */
  async function loadTasks() {
    if (!api.token) {
      dom.tasksBadge.textContent = '0';
      return;
    }

    dom.tasksLoading.style.display = 'flex';
    dom.tasksEmpty.style.display = 'none';

    try {
      const { tasks, meta } = await api.getTasks({
        page: state.taskFilters.page,
        limit: state.taskFilters.limit,
        completed: state.taskFilters.completed === 'all' ? undefined : state.taskFilters.completed === 'completed',
        search: state.taskFilters.search,
        sortBy: state.taskFilters.sortBy,
        sortOrder: state.taskFilters.sortOrder,
      });

      state.tasks = tasks || [];
      state.tasksMeta = meta || { page: 1, limit: state.taskFilters.limit, total: 0, totalPages: 1 };

      renderTasks();
      renderStats();
      renderPagination();
      dom.tasksBadge.textContent = state.tasksMeta.total;
    } catch (err) {
      showToast(err.message || 'Failed to load tasks', 'error');
    } finally {
      dom.tasksLoading.style.display = 'none';
    }
  }

  function renderTasks() {
    dom.tasksList.innerHTML = '';

    if (state.tasks.length === 0) {
      dom.tasksEmpty.style.display = 'flex';
      return;
    }

    dom.tasksEmpty.style.display = 'none';

    state.tasks.forEach((task) => {
      const card = document.createElement('div');
      card.className = `task-card ${task.completed ? 'is-completed' : ''}`;
      card.setAttribute('data-task-id', task.id);

      card.innerHTML = `
        <div class="task-checkbox-wrap">
          <label class="custom-checkbox-label">
            <input type="checkbox" class="task-toggle-checkbox" ${task.completed ? 'checked' : ''} data-id="${task.id}">
            <span class="custom-checkbox"></span>
          </label>
        </div>

        <div class="task-body" title="Click to view full task details">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
          <div class="task-meta">
            <span class="task-tag">#${task.id}</span>
            <span>Created ${formatDate(task.createdAt)}</span>
            ${task.completed ? `<span class="badge-role ADMIN">Completed</span>` : `<span class="badge-role USER">Pending</span>`}
          </div>
        </div>

        <div class="task-actions">
          <button class="btn-icon btn-view-task" data-id="${task.id}" title="View Full Details">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button class="btn-icon btn-edit-task" data-id="${task.id}" title="Edit Task">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-icon btn-delete-task" data-id="${task.id}" data-title="${escapeHtml(task.title)}" title="Delete Task">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;

      // Click task body to view full details
      card.querySelector('.task-body').addEventListener('click', () => {
        openTaskDetailsModal(task.id);
      });

      // View details button
      card.querySelector('.btn-view-task').addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskDetailsModal(task.id);
      });

      // Completion toggle
      const checkbox = card.querySelector('.task-toggle-checkbox');
      checkbox.addEventListener('change', async (e) => {
        const newStatus = e.target.checked;
        try {
          await api.updateTask(task.id, { completed: newStatus });
          task.completed = newStatus;
          card.classList.toggle('is-completed', newStatus);
          renderStats();
          showToast(newStatus ? 'Task completed! 🎉' : 'Task marked as pending', 'success');
        } catch (err) {
          e.target.checked = !newStatus;
          showToast(err.message || 'Failed to update task', 'error');
        }
      });

      // Edit
      card.querySelector('.btn-edit-task').addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskModal('edit', task);
      });

      // Delete
      card.querySelector('.btn-delete-task').addEventListener('click', (e) => {
        e.stopPropagation();
        promptDelete('task', task.id, task.title);
      });

      dom.tasksList.appendChild(card);
    });
  }

  async function openTaskDetailsModal(taskId) {
    state.activeTask = null;
    openModal(dom.taskDetailsModal);
    dom.tdLoading.style.display = 'flex';
    dom.tdContent.style.display = 'none';

    try {
      // Direct call to GET /tasks/:id
      const task = await api.getTask(taskId);
      state.activeTask = task;

      dom.tdTaskId.textContent = `#${task.id}`;
      dom.tdTaskStatusBadge.textContent = task.completed ? 'Completed' : 'Pending';
      dom.tdTaskStatusBadge.className = `badge-role ${task.completed ? 'ADMIN' : 'USER'}`;
      dom.tdTaskTitle.textContent = task.title;
      dom.tdTaskDesc.textContent = task.description || '';
      dom.tdTaskStatusText.textContent = task.completed ? 'Completed' : 'Pending';
      dom.tdTaskOwner.textContent = `User #${task.userId}`;

      const createdDate = new Date(task.createdAt);
      dom.tdTaskCreated.textContent = `${createdDate.toLocaleString()} (${formatDate(task.createdAt)})`;

      const updatedDate = new Date(task.updatedAt || task.createdAt);
      dom.tdTaskUpdated.textContent = `${updatedDate.toLocaleString()} (${formatDate(task.updatedAt || task.createdAt)})`;

      dom.tdToggleStatusLabel.textContent = task.completed ? 'Mark as Pending' : 'Mark as Completed';

      dom.tdLoading.style.display = 'none';
      dom.tdContent.style.display = 'block';
    } catch (err) {
      showToast(err.message || 'Failed to load task details', 'error');
      closeModal(dom.taskDetailsModal);
    }
  }

  function renderStats() {
    const total = state.tasksMeta.total || state.tasks.length;
    const completed = state.tasks.filter((t) => t.completed).length;
    const pending = state.tasks.filter((t) => !t.completed).length;
    const rate = total > 0 ? Math.round((completed / state.tasks.length) * 100) : 0;

    dom.statTotal.textContent = total;
    dom.statCompleted.textContent = completed;
    dom.statPending.textContent = pending;
    dom.statRate.textContent = `${rate}%`;
  }

  function renderPagination() {
    const { page, totalPages, total, limit } = state.tasksMeta;
    if (total === 0) {
      dom.tasksPagination.style.display = 'none';
      return;
    }

    dom.tasksPagination.style.display = 'flex';
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    dom.paginationInfo.textContent = `Showing ${start}-${end} of ${total} tasks`;

    dom.paginationControls.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '&laquo;';
    prevBtn.disabled = page <= 1;
    prevBtn.addEventListener('click', () => {
      state.taskFilters.page = page - 1;
      loadTasks();
    });
    dom.paginationControls.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-btn ${i === page ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
          state.taskFilters.page = i;
          loadTasks();
        });
        dom.paginationControls.appendChild(pageBtn);
      } else if (i === page - 2 || i === page + 2) {
        const dots = document.createElement('span');
        dots.style.padding = '0 0.3rem';
        dots.style.color = 'var(--text-muted)';
        dots.textContent = '...';
        dom.paginationControls.appendChild(dots);
      }
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '&raquo;';
    nextBtn.disabled = page >= totalPages;
    nextBtn.addEventListener('click', () => {
      state.taskFilters.page = page + 1;
      loadTasks();
    });
    dom.paginationControls.appendChild(nextBtn);
  }

  function openTaskModal(mode = 'create', task = null) {
    dom.taskModalForm.reset();
    if (mode === 'create') {
      dom.taskModalTitle.textContent = 'Create New Task';
      dom.taskFormId.value = '';
      dom.taskFormCompletedGroup.style.display = 'none';
      dom.taskTitleCount.textContent = '0';
      dom.taskDescCount.textContent = '0';
    } else if (task) {
      dom.taskModalTitle.textContent = 'Edit Task';
      dom.taskFormId.value = task.id;
      dom.taskFormTitle.value = task.title;
      dom.taskFormDesc.value = task.description || '';
      dom.taskFormCompleted.checked = task.completed;
      dom.taskFormCompletedGroup.style.display = 'block';
      dom.taskTitleCount.textContent = task.title.length;
      dom.taskDescCount.textContent = (task.description || '').length;
    }
    openModal(dom.taskModal);
  }

  /* Products */
  async function loadProducts() {
    dom.productsLoading.style.display = 'flex';
    try {
      const products = await api.getProducts();
      state.products = products || [];
      renderProducts();
      dom.productsBadge.textContent = state.products.length;
      dom.productStatsBadge.textContent = `${state.products.length} Products in Store`;
    } catch (err) {
      showToast(err.message || 'Failed to load products', 'error');
    } finally {
      dom.productsLoading.style.display = 'none';
    }
  }

  function renderProducts() {
    dom.productsGrid.innerHTML = '';
    const search = state.productSearch.toLowerCase();
    const filtered = state.products.filter((p) => p.name.toLowerCase().includes(search));

    if (filtered.length === 0) {
      dom.productsGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3>No Products Found</h3>
          <p>No products match your search or the store is empty.</p>
        </div>
      `;
      return;
    }

    filtered.forEach((product) => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <div>
          <div class="product-card-top">
            <span class="product-id-tag">ID: #${product.id}</span>
            <span class="badge-pro" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">In Stock</span>
          </div>
          <div class="product-title">${escapeHtml(product.name)}</div>
          <div class="product-price-row">
            <span class="price-currency">$</span>
            <span class="price-amount">${Number(product.price).toFixed(2)}</span>
          </div>
        </div>
        <div class="product-card-actions">
          <button class="btn btn-secondary btn-edit-product" style="flex:1;" data-id="${product.id}" title="Edit Product">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span>Edit</span>
          </button>
          <button class="btn btn-secondary btn-delete-product" data-id="${product.id}" data-name="${escapeHtml(product.name)}" title="Delete Product">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;

      card.querySelector('.btn-edit-product').addEventListener('click', () => {
        openProductModal('edit', product);
      });

      card.querySelector('.btn-delete-product').addEventListener('click', () => {
        promptDelete('product', product.id, product.name);
      });

      dom.productsGrid.appendChild(card);
    });
  }

  function openProductModal(mode = 'create', product = null) {
    dom.productModalForm.reset();
    if (mode === 'create') {
      dom.productModalTitle.textContent = 'Add New Product';
      dom.productFormId.value = '';
    } else if (product) {
      dom.productModalTitle.textContent = 'Edit Product';
      dom.productFormId.value = product.id;
      dom.productFormName.value = product.name;
      dom.productFormPrice.value = product.price;
    }
    openModal(dom.productModal);
  }

  /* Delete Confirmation */
  function promptDelete(type, id, name) {
    state.deleteTarget = { type, id, name };
    dom.confirmModalMessage.textContent = `Are you sure you want to delete "${name}"? This action cannot be undone.`;
    openModal(dom.confirmModal);
  }

  /* Admin Guard View */
  function updateAdminView() {
    const user = api.user;
    const token = api.token;

    if (user && token) {
      dom.adminTestUsername.textContent = `${user.name || user.email} (ID: ${user.id})`;
      dom.adminTestRole.textContent = user.role || 'USER';
      dom.adminTestRole.className = `badge-role ${user.role || 'USER'}`;
      dom.adminTestToken.textContent = `${token.substring(0, 24)}...`;
    } else {
      dom.adminTestUsername.textContent = 'Not Logged In (Guest)';
      dom.adminTestRole.textContent = 'NONE';
      dom.adminTestRole.className = 'badge-role';
      dom.adminTestToken.textContent = 'No Bearer token present';
    }
  }

  /* Inspector */
  function renderInspectorLogs(logs) {
    dom.inspectorTableBody.innerHTML = '';
    if (!logs || logs.length === 0) {
      dom.inspectorEmpty.style.display = 'block';
      return;
    }

    dom.inspectorEmpty.style.display = 'none';

    logs.forEach((log) => {
      const row = document.createElement('tr');
      const statusGroup = String(log.status).charAt(0) + 'xx';

      row.innerHTML = `
        <td><span class="status-pill status-${statusGroup}">${log.status || 'ERR'}</span></td>
        <td><span class="method-badge method-${log.method}">${log.method}</span></td>
        <td><code class="url-code">${escapeHtml(log.endpoint)}</code></td>
        <td><span class="latency-pill">${log.latency}ms</span></td>
        <td style="color:var(--text-muted); font-size:0.75rem;">${log.timestamp}</td>
        <td>
          <button class="btn btn-secondary btn-inspect-log" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;">
            Inspect
          </button>
        </td>
      `;

      row.querySelector('.btn-inspect-log').addEventListener('click', () => {
        openInspectorDetail(log);
      });

      dom.inspectorTableBody.appendChild(row);
    });
  }

  function openInspectorDetail(log) {
    dom.inspReqMethod.textContent = log.method;
    dom.inspReqMethod.className = `method-badge method-${log.method}`;
    dom.inspReqUrl.textContent = log.fullUrl;

    if (log.requestBody) {
      dom.inspReqBodyContainer.style.display = 'block';
      dom.inspReqBody.textContent = JSON.stringify(log.requestBody, null, 2);
    } else {
      dom.inspReqBodyContainer.style.display = 'none';
    }

    const statusGroup = String(log.status).charAt(0) + 'xx';
    dom.inspResStatus.textContent = `${log.status} ${log.success ? 'OK' : 'Error'}`;
    dom.inspResStatus.className = `status-pill status-${statusGroup}`;
    dom.inspResTime.textContent = `${log.latency}ms`;
    dom.inspResBody.textContent = JSON.stringify(log.responseData, null, 2);

    openModal(dom.inspectorModal);
  }

  /* Health Poller */
  async function checkBackendHealth() {
    if (state.isPinging) return;
    state.isPinging = true;

    const res = await api.ping();
    if (res.ok) {
      dom.statusDot.className = 'status-dot connected';
      dom.statusLabel.textContent = 'Backend: Online';
      dom.latencyBadge.textContent = `${res.latency}ms`;
    } else {
      dom.statusDot.className = 'status-dot disconnected';
      dom.statusLabel.textContent = 'Backend: Offline';
      dom.latencyBadge.textContent = 'ERR';
    }
    state.isPinging = false;
  }

  /* Event Listeners Setup */
  function attachEventListeners() {
    // Nav tabs
    dom.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        switchTab(tab.getAttribute('data-tab'));
      });
    });

    // Theme toggle
    dom.themeToggleBtn.addEventListener('click', () => {
      const current = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      document.body.className = `theme-${nextTheme}`;
      localStorage.setItem('taskflow_theme', nextTheme);
    });

    // Modals overlay & ESC
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay);
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach((modal) => {
          if (modal.style.display === 'flex') closeModal(modal);
        });
      }
    });

    // Auth Modal tab switching
    dom.authTabLogin.addEventListener('click', () => openAuthModal('login'));
    dom.authTabRegister.addEventListener('click', () => openAuthModal('register'));
    dom.authModalClose.addEventListener('click', () => closeModal(dom.authModal));
    dom.loginModalCancel.addEventListener('click', () => closeModal(dom.authModal));
    dom.regModalCancel.addEventListener('click', () => closeModal(dom.authModal));
    dom.bannerLoginBtn.addEventListener('click', () => openAuthModal('login'));
    dom.bannerRegisterBtn.addEventListener('click', () => openAuthModal('register'));

    // Login Form
    dom.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      try {
        const res = await api.login({ email, password });
        showToast(`Welcome back, ${res.user?.name || res.user?.email || 'User'}!`, 'success');
        closeModal(dom.authModal);
        dom.loginForm.reset();
        loadTasks();
      } catch (err) {
        showToast(err.message || 'Login failed. Please check credentials.', 'error');
      }
    });

    // Register Form
    dom.registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      try {
        await api.register({ name, email, password });
        showToast('Registration successful! Logging in...', 'success');
        const loginRes = await api.login({ email, password });
        showToast(`Welcome, ${loginRes.user?.name}!`, 'success');
        closeModal(dom.authModal);
        dom.registerForm.reset();
        loadTasks();
      } catch (err) {
        showToast(err.message || 'Registration failed.', 'error');
      }
    });

    // Tasks filter & search
    let searchDebounceTimeout = null;
    dom.taskSearchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      dom.taskSearchClear.style.display = val ? 'block' : 'none';
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        state.taskFilters.search = val;
        state.taskFilters.page = 1;
        loadTasks();
      }, 350);
    });

    dom.taskSearchClear.addEventListener('click', () => {
      dom.taskSearchInput.value = '';
      dom.taskSearchClear.style.display = 'none';
      state.taskFilters.search = '';
      state.taskFilters.page = 1;
      loadTasks();
    });

    dom.filterPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        dom.filterPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.taskFilters.completed = pill.getAttribute('data-filter');
        state.taskFilters.page = 1;
        loadTasks();
      });
    });

    dom.taskSortBy.addEventListener('change', (e) => {
      state.taskFilters.sortBy = e.target.value;
      loadTasks();
    });

    dom.taskOrderToggle.addEventListener('click', () => {
      const nextOrder = state.taskFilters.sortOrder === 'desc' ? 'asc' : 'desc';
      state.taskFilters.sortOrder = nextOrder;
      dom.orderIconDesc.style.display = nextOrder === 'desc' ? 'block' : 'none';
      dom.orderIconAsc.style.display = nextOrder === 'asc' ? 'block' : 'none';
      loadTasks();
    });

    dom.taskLimitSelect.addEventListener('change', (e) => {
      state.taskFilters.limit = Number(e.target.value);
      state.taskFilters.page = 1;
      loadTasks();
    });

    // Task modal handlers
    dom.openCreateTaskBtn.addEventListener('click', () => openTaskModal('create'));
    dom.emptyCreateTaskBtn.addEventListener('click', () => openTaskModal('create'));
    dom.taskModalClose.addEventListener('click', () => closeModal(dom.taskModal));
    dom.taskModalCancel.addEventListener('click', () => closeModal(dom.taskModal));

    dom.taskFormTitle.addEventListener('input', (e) => {
      dom.taskTitleCount.textContent = e.target.value.length;
    });
    dom.taskFormDesc.addEventListener('input', (e) => {
      dom.taskDescCount.textContent = e.target.value.length;
    });

    dom.taskModalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = dom.taskFormId.value;
      const title = dom.taskFormTitle.value.trim();
      const description = dom.taskFormDesc.value.trim();
      const completed = dom.taskFormCompleted.checked;

      try {
        if (id) {
          await api.updateTask(id, { title, description, completed });
          showToast('Task updated successfully', 'success');
        } else {
          await api.createTask({ title, description });
          showToast('Task created successfully', 'success');
        }
        closeModal(dom.taskModal);
        loadTasks();
      } catch (err) {
        showToast(err.message || 'Operation failed', 'error');
      }
    });

    // Product search & modal handlers
    dom.productSearchInput.addEventListener('input', (e) => {
      state.productSearch = e.target.value.trim();
      renderProducts();
    });

    dom.openCreateProductBtn.addEventListener('click', () => openProductModal('create'));
    dom.productModalClose.addEventListener('click', () => closeModal(dom.productModal));
    dom.productModalCancel.addEventListener('click', () => closeModal(dom.productModal));

    dom.productModalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = dom.productFormId.value;
      const name = dom.productFormName.value.trim();
      const price = parseFloat(dom.productFormPrice.value);

      if (isNaN(price) || price <= 0) {
        showToast('Price must be a positive number', 'error');
        return;
      }

      try {
        if (id) {
          await api.updateProduct(id, { name, price });
          showToast('Product updated successfully', 'success');
        } else {
          await api.createProduct({ name, price });
          showToast('Product created successfully', 'success');
        }
        closeModal(dom.productModal);
        loadProducts();
      } catch (err) {
        showToast(err.message || 'Operation failed', 'error');
      }
    });

    // Confirm Modal
    dom.confirmModalClose.addEventListener('click', () => closeModal(dom.confirmModal));
    dom.confirmModalCancel.addEventListener('click', () => closeModal(dom.confirmModal));

    dom.confirmModalConfirm.addEventListener('click', async () => {
      if (!state.deleteTarget) return;
      const { type, id } = state.deleteTarget;
      try {
        if (type === 'task') {
          await api.deleteTask(id);
          showToast('Task deleted successfully', 'info');
          loadTasks();
        } else if (type === 'product') {
          await api.deleteProduct(id);
          showToast('Product removed from catalog', 'info');
          loadProducts();
        }
      } catch (err) {
        showToast(err.message || 'Delete failed', 'error');
      } finally {
        state.deleteTarget = null;
        closeModal(dom.confirmModal);
      }
    });

    // Task Details Modal Handlers
    dom.taskDetailsClose.addEventListener('click', () => closeModal(dom.taskDetailsModal));
    dom.tdBtnClose.addEventListener('click', () => closeModal(dom.taskDetailsModal));

    // Copy Description Text
    dom.tdCopyDescBtn.addEventListener('click', () => {
      const text = dom.tdTaskDesc.textContent;
      if (!text) {
        showToast('No description to copy', 'info');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        showToast('Task description copied to clipboard!', 'success');
      }).catch(() => {
        showToast('Could not copy to clipboard', 'error');
      });
    });

    // Toggle status from Details Modal
    dom.tdBtnToggleStatus.addEventListener('click', async () => {
      if (!state.activeTask) return;
      const newStatus = !state.activeTask.completed;
      try {
        await api.updateTask(state.activeTask.id, { completed: newStatus });
        state.activeTask.completed = newStatus;
        dom.tdTaskStatusBadge.textContent = newStatus ? 'Completed' : 'Pending';
        dom.tdTaskStatusBadge.className = `badge-role ${newStatus ? 'ADMIN' : 'USER'}`;
        dom.tdTaskStatusText.textContent = newStatus ? 'Completed' : 'Pending';
        dom.tdToggleStatusLabel.textContent = newStatus ? 'Mark as Pending' : 'Mark as Completed';
        showToast(newStatus ? 'Marked as completed! 🎉' : 'Marked as pending', 'success');
        loadTasks();
      } catch (err) {
        showToast(err.message || 'Failed to update status', 'error');
      }
    });

    // Edit from Details Modal
    dom.tdBtnEdit.addEventListener('click', () => {
      if (!state.activeTask) return;
      const taskToEdit = { ...state.activeTask };
      closeModal(dom.taskDetailsModal);
      openTaskModal('edit', taskToEdit);
    });

    // Delete from Details Modal
    dom.tdBtnDelete.addEventListener('click', () => {
      if (!state.activeTask) return;
      const taskToDelete = { ...state.activeTask };
      closeModal(dom.taskDetailsModal);
      promptDelete('task', taskToDelete.id, taskToDelete.title);
    });

    // Admin Guard Test Trigger
    dom.btnTriggerAdminTest.addEventListener('click', async () => {
      dom.adminResponseBox.style.display = 'block';
      dom.adminResponseBody.textContent = 'Calling GET /tasks/admin-test...';
      dom.adminResponseStatus.className = 'response-status';
      dom.adminResponseStatus.textContent = 'Loading...';

      try {
        const res = await api.adminTest();
        dom.adminResponseStatus.textContent = '200 OK';
        dom.adminResponseStatus.className = 'response-status status-200';
        dom.adminResponseBody.textContent = JSON.stringify(res, null, 2);
        showToast('Admin Guard passed! You are authorized.', 'success');
      } catch (err) {
        const status = err.status || 401;
        dom.adminResponseStatus.textContent = `${status} ${err.message || 'Error'}`;
        dom.adminResponseStatus.className = `response-status status-${status}`;
        dom.adminResponseBody.textContent = JSON.stringify(err.data || { error: err.message }, null, 2);
        showToast(`Guard prevented access: ${err.message}`, 'error');
      }
    });

    // Network Inspector handlers
    dom.inspectorModalClose.addEventListener('click', () => closeModal(dom.inspectorModal));
    dom.inspectorModalCloseBtn.addEventListener('click', () => closeModal(dom.inspectorModal));

    dom.btnClearInspector.addEventListener('click', () => {
      api.networkLogs = [];
      dom.networkBadge.textContent = '0';
      renderInspectorLogs([]);
      showToast('Inspector logs cleared', 'info');
    });

    dom.btnTestPing.addEventListener('click', async () => {
      const res = await api.ping();
      if (res.ok) {
        showToast(`Backend responded: ${JSON.stringify(res.data)} (${res.latency}ms)`, 'success');
      } else {
        showToast(`Ping failed: ${res.error}`, 'error');
      }
    });

    // Health pill click
    dom.apiHealthBtn.addEventListener('click', async () => {
      showToast('Testing backend connectivity...', 'info');
      await checkBackendHealth();
    });

    // API logs listener
    api.onNetworkLog((logItem, allLogs) => {
      if (dom.networkBadge) dom.networkBadge.textContent = allLogs.length;
      renderInspectorLogs(allLogs);
    });

    // Session listener
    api.onSessionChange(() => {
      updateAuthUI();
    });
  }

  // DOM Content Loaded / Init
  function init() {
    dom = getDom();
    attachEventListeners();
    updateAuthUI();
    checkBackendHealth();
    loadProducts();
    if (api.token) {
      loadTasks();
    }
    setInterval(checkBackendHealth, 25000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
