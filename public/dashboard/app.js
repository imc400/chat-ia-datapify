/**
 * DATAPIFY DASHBOARD - CLIENT APP
 * Gestión de conversaciones de WhatsApp en tiempo real
 */

class DashboardApp {
  constructor() {
    this.currentConversation = null;
    this.conversations = [];
    this.refreshInterval = null;
    this.init();
  }

  init() {
    // Configurar navegación
    this.setupNavigation();

    // Cargar estadísticas
    this.loadStats();

    // Cargar conversaciones
    this.loadConversations();

    // Configurar eventos
    this.setupEventListeners();

    // Auto-refresh cada 10 segundos
    this.startAutoRefresh();
  }

  /**
   * Configurar navegación entre páginas
   */
  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPage = item.dataset.page;

        // Actualizar nav items
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        // Mostrar página correspondiente
        pages.forEach(page => page.classList.remove('active'));
        document.getElementById(`page-${targetPage}`).classList.add('active');

        // Cargar datos según la página
        if (targetPage === 'leads') {
          this.loadLeadsPage();
        }
      });
    });
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Botón de refresh
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.loadConversations();
    });

    // Filtro por estado
    document.getElementById('filter-status').addEventListener('change', (e) => {
      this.filterByStatus(e.target.value);
    });

    // Búsqueda
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.filterConversations(e.target.value);
    });
  }

  /**
   * Cargar estadísticas generales
   */
  async loadStats() {
    try {
      const response = await fetch('/api/dashboard/stats');
      const { data } = await response.json();

      document.getElementById('stat-total').textContent = data.total;
      document.getElementById('stat-hot').textContent = data.leads.hot;
      document.getElementById('stat-scheduled').textContent = data.scheduled;
      document.getElementById('stat-conversion').textContent = `${data.last7Days.conversionRate}%`;
      document.getElementById('active-badge').textContent = data.active;

    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  }

  /**
   * Cargar lista de conversaciones
   */
  async loadConversations(temperature = '') {
    try {
      const params = new URLSearchParams();
      if (temperature) params.append('temperature', temperature);

      const response = await fetch(`/api/dashboard/conversations?${params}`);
      const { data } = await response.json();

      this.conversations = data;
      this.renderConversations(data);

    } catch (error) {
      console.error('Error cargando conversaciones:', error);
      this.showError('No se pudieron cargar las conversaciones');
    }
  }

  /**
   * Renderizar lista de conversaciones (agrupadas por teléfono)
   */
  renderConversations(conversations) {
    const container = document.getElementById('conversations-list');

    if (conversations.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay conversaciones</div>';
      return;
    }

    container.innerHTML = conversations.map(conv => `
      <div class="conversation-item" data-phone="${conv.phone}">
        <div class="conversation-item-header">
          <span class="conversation-phone">${this.formatPhone(conv.phone)}</span>
          <span class="conversation-time">${this.formatTime(conv.updatedAt)}</span>
        </div>
        <div class="conversation-preview">
          ${conv.lastMessage ? this.truncate(conv.lastMessage.content, 60) : 'Sin mensajes'}
        </div>
        <div class="conversation-meta">
          ${conv.leadData?.hasShopify ? '<span class="lead-badge shopify">🛍️ Shopify</span>' : ''}
          ${conv.scheduledMeeting ? `<span class="meeting-badge">📅 Agendado${conv.calendarEventCount > 1 ? ` (${conv.calendarEventCount})` : ''}</span>` : ''}
          ${conv.conversationCount > 1 ? `<span class="conversation-count-badge">${conv.conversationCount} conversaciones</span>` : ''}
        </div>
      </div>
    `).join('');

    // Agregar event listeners después de renderizar
    container.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectConversationByPhone(item.dataset.phone);
      });
    });
  }

  /**
   * Filtrar conversaciones por búsqueda
   */
  filterConversations(query) {
    if (!query) {
      this.renderConversations(this.conversations);
      return;
    }

    const filtered = this.conversations.filter(conv => {
      const phone = conv.phone.toLowerCase();
      const name = conv.leadData?.name?.toLowerCase() || '';
      const q = query.toLowerCase();
      return phone.includes(q) || name.includes(q);
    });

    this.renderConversations(filtered);
  }

  /**
   * Filtrar conversaciones por estado (Shopify, Agendado, Activo)
   */
  filterByStatus(status) {
    if (!status) {
      this.renderConversations(this.conversations);
      return;
    }

    const filtered = this.conversations.filter(conv => {
      switch (status) {
        case 'shopify':
          return conv.leadData?.hasShopify === true;
        case 'scheduled':
          return conv.scheduledMeeting === true;
        case 'active':
          return conv.status === 'active';
        default:
          return true;
      }
    });

    this.renderConversations(filtered);
  }

  /**
   * Seleccionar conversación por teléfono (historial completo)
   */
  async selectConversationByPhone(phone) {
    try {
      // Marcar como activa
      document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
      });
      document.querySelector(`[data-phone="${phone}"]`).classList.add('active');

      // Cargar historial completo del teléfono
      const response = await fetch(`/api/dashboard/phone/${phone}`);
      const { data } = await response.json();

      this.currentConversation = data;
      this.renderPhoneHistory(data);
      this.renderPhoneInfo(data);

    } catch (error) {
      console.error('Error cargando historial:', error);
      this.showError('No se pudo cargar el historial');
    }
  }

  /**
   * LEGACY: Seleccionar una conversación individual
   */
  async selectConversation(conversationId) {
    try {
      // Marcar como activa
      document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
      });

      // Cargar conversación completa
      const response = await fetch(`/api/dashboard/conversations/${conversationId}`);
      const { data } = await response.json();

      this.currentConversation = data;
      this.renderMessages(data);
      this.renderConversationInfo(data);

    } catch (error) {
      console.error('Error cargando conversación:', error);
      this.showError('No se pudo cargar la conversación');
    }
  }

  /**
   * Renderizar historial completo de un teléfono (todas las conversaciones)
   */
  renderPhoneHistory(data) {
    const header = document.getElementById('messages-header');
    const container = document.getElementById('messages-container');

    // Header con información del teléfono
    header.innerHTML = `
      <div class="contact-header">
        <div class="contact-info">
          <h3>${data.leadData?.name || 'Usuario'}</h3>
          <p class="contact-phone">${this.formatPhone(data.phone)}</p>
          <p class="contact-subtext">${data.summary.totalConversations} conversaciones • ${data.summary.totalMessages} mensajes</p>
        </div>
        <div class="conversation-meta">
          <span class="lead-badge hot">
            Score: ${data.summary.bestLeadScore}/10
          </span>
        </div>
      </div>
    `;

    // Mensajes con separadores de conversación
    if (data.messages.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay mensajes</div>';
      return;
    }

    let html = '';
    let lastConversationId = null;

    data.messages.forEach((msg, index) => {
      // Agregar separador cuando cambia la conversación
      if (msg.conversationId !== lastConversationId) {
        const conv = data.conversations.find(c => c.id === msg.conversationId);
        if (index > 0) {
          html += `
            <div class="conversation-separator">
              <span class="separator-line"></span>
              <span class="separator-text">Nueva conversación - ${this.formatFullTime(conv.startedAt)}</span>
              <span class="separator-line"></span>
            </div>
          `;
        } else {
          html += `
            <div class="conversation-separator">
              <span class="separator-text">Primera conversación - ${this.formatFullTime(conv.startedAt)}</span>
            </div>
          `;
        }
        lastConversationId = msg.conversationId;
      }

      html += `
        <div class="message ${msg.role}">
          <div class="message-avatar">${msg.role === 'user' ? 'U' : 'A'}</div>
          <div class="message-content">
            <div class="message-bubble">${this.escapeHtml(msg.content)}</div>
            <div class="message-time">${this.formatFullTime(msg.timestamp)}</div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Renderizar información del teléfono (lead)
   */
  renderPhoneInfo(data) {
    const container = document.getElementById('conversation-info');

    const leadData = data.leadData || {};
    const summary = data.summary;
    const calendarData = data.calendarFormData; // NUEVO: Datos del calendario

    container.innerHTML = `
      <div class="info-panel-toggle" id="info-toggle">
        <div class="info-panel-toggle-text">
          📋 Información del Lead
        </div>
        <div class="info-panel-toggle-icon">▼</div>
      </div>
      <div class="info-panel-content" id="info-content">
        ${calendarData ? `
        <div class="info-section" style="background: #dcfce7; border-left: 4px solid #16a34a;">
          <h4>✅ Datos del Calendario (${data.calendarEventCount} evento${data.calendarEventCount > 1 ? 's' : ''})</h4>
          <div class="info-item">
            <span class="info-label">Nombre:</span>
            <span class="info-value">${calendarData.nombre || '-'} ${calendarData.apellido || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Email:</span>
            <span class="info-value">${calendarData.email || 'No proporcionado'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Teléfono:</span>
            <span class="info-value">${calendarData.telefono || 'No proporcionado'}</span>
          </div>
          ${calendarData.sitioWeb ? `
          <div class="info-item">
            <span class="info-label">Sitio Web:</span>
            <span class="info-value">${calendarData.sitioWeb}</span>
          </div>
          ` : ''}
          <div class="info-item">
            <span class="info-label">Origen:</span>
            <span class="info-value">${calendarData.source === 'whatsapp_bot' ? '💬 WhatsApp Bot' : calendarData.source === 'google_appointment' ? '📅 Google Appointment' : '✏️ Manual'}</span>
          </div>
        </div>
        ` : ''}

        <div class="info-section">
        <h4>Información del Lead (CRM)</h4>
        <div class="info-item">
          <span class="info-label">Nombre:</span>
          <span class="info-value">${leadData.name || 'No especificado'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Negocio:</span>
          <span class="info-value">${leadData.businessType || 'No especificado'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Tiene Shopify:</span>
          <span class="info-value">${leadData.hasShopify === true ? '✅ Sí' : leadData.hasShopify === false ? '❌ No' : '❓ Desconocido'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Invierte en Ads:</span>
          <span class="info-value">${leadData.investsInAds ? '✅ Sí' : '❌ No'}</span>
        </div>
      </div>

      <div class="info-section">
        <h4>Historial</h4>
        <div class="info-item">
          <span class="info-label">Conversaciones:</span>
          <span class="info-value">${summary.totalConversations}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Total mensajes:</span>
          <span class="info-value">${summary.totalMessages}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Lead Score:</span>
          <span class="info-value">${summary.bestLeadScore}/10</span>
        </div>
        <div class="info-item">
          <span class="info-label">Reunión agendada:</span>
          <span class="info-value">${summary.hasScheduledMeeting ? '✅ Sí' : '❌ No'}</span>
        </div>
      </div>

      <div class="info-section">
        <h4>Timeline</h4>
        <div class="info-item">
          <span class="info-label">Primer contacto:</span>
          <span class="info-value">${this.formatFullTime(summary.firstContact)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Última actividad:</span>
          <span class="info-value">${this.formatFullTime(summary.lastActivity)}</span>
        </div>
      </div>

        <div class="info-section">
          <h4>Conversaciones individuales</h4>
          ${data.conversations.map((conv, i) => `
            <div class="conversation-timeline-item">
              <strong>Conversación ${i + 1}</strong><br>
              <small>${this.formatFullTime(conv.startedAt)}</small><br>
              <span class="info-label">${conv.messageCount} mensajes • ${this.formatStatus(conv.status)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Agregar event listener para toggle
    const toggle = document.getElementById('info-toggle');
    const content = document.getElementById('info-content');

    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      content.classList.toggle('active');
    });
  }

  /**
   * Renderizar mensajes de la conversación
   */
  renderMessages(conversation) {
    const header = document.getElementById('messages-header');
    const container = document.getElementById('messages-container');

    // Header
    header.innerHTML = `
      <div class="contact-header">
        <div class="contact-info">
          <h3>${conversation.leadData?.name || 'Usuario'}</h3>
          <p class="contact-phone">${this.formatPhone(conversation.phone)}</p>
        </div>
        <div class="conversation-meta">
          <span class="lead-badge ${conversation.leadTemperature}">
            ${this.formatTemperature(conversation.leadTemperature)}
          </span>
        </div>
      </div>
    `;

    // Mensajes
    if (conversation.messages.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay mensajes en esta conversación</div>';
      return;
    }

    container.innerHTML = conversation.messages.map(msg => `
      <div class="message ${msg.role}">
        <div class="message-avatar">${msg.role === 'user' ? 'U' : 'A'}</div>
        <div class="message-content">
          <div class="message-bubble">${this.escapeHtml(msg.content)}</div>
          <div class="message-time">${this.formatFullTime(msg.timestamp)}</div>
        </div>
      </div>
    `).join('');

    // Scroll al final
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Renderizar información del lead
   */
  renderConversationInfo(conversation) {
    const container = document.getElementById('conversation-info');

    const leadData = conversation.leadData || {};
    const analytics = conversation.analytics || {};

    container.innerHTML = `
      <div class="info-panel-toggle" id="info-toggle">
        <div class="info-panel-toggle-text">
          📋 Información del Lead
        </div>
        <div class="info-panel-toggle-icon">▼</div>
      </div>
      <div class="info-panel-content" id="info-content">
        <div class="info-section">
        <h4>Información del Lead</h4>
        <div class="info-item">
          <span class="info-label">Nombre:</span>
          <span class="info-value">${leadData.name || 'No especificado'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Negocio:</span>
          <span class="info-value">${leadData.businessType || 'No especificado'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Tiene Shopify:</span>
          <span class="info-value">${leadData.hasShopify === true ? '✅ Sí' : leadData.hasShopify === false ? '❌ No' : '❓ Desconocido'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Invierte en Ads:</span>
          <span class="info-value">${leadData.investsInAds ? '✅ Sí' : '❌ No'}</span>
        </div>
      </div>

      <div class="info-section">
        <h4>Estadísticas</h4>
        <div class="info-item">
          <span class="info-label">Total mensajes:</span>
          <span class="info-value">${analytics.totalMessages || 0}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Lead Score:</span>
          <span class="info-value">${conversation.leadScore}/10</span>
        </div>
        <div class="info-item">
          <span class="info-label">Estado:</span>
          <span class="info-value">${this.formatStatus(conversation.status)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Resultado:</span>
          <span class="info-value">${this.formatOutcome(conversation.outcome)}</span>
        </div>
      </div>

        <div class="info-section">
          <h4>Timeline</h4>
          <div class="info-item">
            <span class="info-label">Iniciado:</span>
            <span class="info-value">${this.formatFullTime(conversation.startedAt)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Última actividad:</span>
            <span class="info-value">${this.formatFullTime(conversation.updatedAt)}</span>
          </div>
        </div>
      </div>
    `;

    // Agregar event listener para toggle
    const toggle = document.getElementById('info-toggle');
    const content = document.getElementById('info-content');

    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      content.classList.toggle('active');
    });
  }

  /**
   * Auto-refresh cada 10 segundos
   */
  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.loadStats();
      this.loadConversations();

      // Si hay conversación seleccionada, recargarla
      if (this.currentConversation) {
        this.selectConversation(this.currentConversation.id);
      }
    }, 10000); // 10 segundos
  }

  /**
   * Helpers - Formateo
   */
  formatPhone(phone) {
    // Formatear número de WhatsApp: +56912345678 -> +569 1234 5678
    if (phone.startsWith('56')) {
      return `+${phone.slice(0, 3)} ${phone.slice(3, 7)} ${phone.slice(7)}`;
    }
    return phone;
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('es-CL');
  }

  formatFullTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatTemperature(temp) {
    const map = {
      hot: '🔥 Hot',
      warm: '🟡 Warm',
      cold: '❄️ Cold',
    };
    return map[temp] || temp;
  }

  formatStatus(status) {
    const map = {
      active: 'Activa',
      completed: 'Completada',
      abandoned: 'Abandonada',
    };
    return map[status] || status;
  }

  formatOutcome(outcome) {
    const map = {
      scheduled: '✅ Reunión agendada',
      disqualified: '❌ Descalificado',
      abandoned: '⏸️ Abandonado',
      pending: '⏳ Pendiente',
    };
    return map[outcome] || outcome || 'N/A';
  }

  truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showError(message) {
    // Puedes implementar un toast o notificación
    console.error(message);
    alert(message);
  }

  /**
   * ==============================================
   * PÁGINA DE LEADS - NUEVAS FUNCIONALIDADES
   * ==============================================
   */

  async loadLeadsPage() {
    try {
      const [leadsResponse, statsResponse] = await Promise.all([
        fetch('/api/dashboard/leads?limit=100'),
        fetch('/api/dashboard/conversion-stats'),
      ]);

      const { data: leads } = await leadsResponse.json();
      const { data: stats } = await statsResponse.json();

      this.renderLeadsStats(stats);
      this.renderLeadsTable(leads);
      this.setupLeadsFilters();

    } catch (error) {
      console.error('Error cargando página de leads:', error);
      this.showError('Error cargando leads');
    }
  }

  renderLeadsStats(stats) {
    const container = document.getElementById('leads-stats');
    if (!container) return;

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-details">
          <div class="stat-label">Total Leads</div>
          <div class="stat-value">${stats.totalLeads}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🎯</div>
        <div class="stat-details">
          <div class="stat-label">Con Shopify</div>
          <div class="stat-value">${stats.metrics.withShopify}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-details">
          <div class="stat-label">Agendados</div>
          <div class="stat-value">${stats.metrics.scheduled}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-details">
          <div class="stat-label">Pagaron</div>
          <div class="stat-value">${stats.metrics.totalPaid}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-details">
          <div class="stat-label">Tasa de Conversión</div>
          <div class="stat-value">${stats.metrics.conversionRate}%</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🔄</div>
        <div class="stat-details">
          <div class="stat-label">Trial 14 días</div>
          <div class="stat-value">${stats.byStatus.trial_14_days}</div>
        </div>
      </div>
    `;
  }

  renderLeadsTable(leads) {
    const container = document.getElementById('leads-table');
    if (!container) return;

    if (leads.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay leads para mostrar</div>';
      return;
    }

    container.innerHTML = `
      <table class="leads-table">
        <thead>
          <tr>
            <th>Teléfono</th>
            <th>Nombre</th>
            <th>Email</th>
            <th>Sitio Web</th>
            <th>Shopify</th>
            <th>Estado</th>
            <th>Agendado</th>
            <th>Score</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map(lead => `
            <tr data-phone="${lead.phone}">
              <td>${lead.phone}</td>
              <td>${lead.name || '-'} ${lead.lastName || ''}</td>
              <td>${lead.email || '-'}</td>
              <td>${lead.website ? `<a href="${lead.website}" target="_blank">${lead.website}</a>` : '-'}</td>
              <td>${lead.hasShopify ? '✅' : '❌'}</td>
              <td>
                ${this.renderConversionStatusBadge(lead.conversionStatus)}
              </td>
              <td>${lead.scheduledMeeting ? `✅ (${lead.calendarEventCount})` : '❌'}</td>
              <td>${lead.leadScore}/10</td>
              <td>
                <button class="btn-change-status" data-phone="${lead.phone}" data-status="${lead.conversionStatus || 'none'}">
                  Cambiar Estado
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Agregar event listeners para cambiar estado
    container.querySelectorAll('.btn-change-status').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const phone = e.target.dataset.phone;
        const currentStatus = e.target.dataset.status;
        this.showConversionStatusModal(phone, currentStatus);
      });
    });
  }

  renderConversionStatusBadge(status) {
    const badges = {
      trial_14_days: '<span class="status-badge trial">🔄 Trial 14d</span>',
      paid_monthly_bonus: '<span class="status-badge paid">💰 Mensual + Bonos</span>',
      paid_after_trial: '<span class="status-badge paid">💰 Pagó post-trial</span>',
      none: '<span class="status-badge none">Sin conversión</span>',
    };
    return badges[status] || badges.none;
  }

  showConversionStatusModal(phone, currentStatus) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Cambiar Estado de Conversión</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p><strong>Teléfono:</strong> ${phone}</p>
          <p><strong>Estado actual:</strong> ${this.renderConversionStatusBadge(currentStatus)}</p>

          <label for="conversion-status">Nuevo estado:</label>
          <select id="conversion-status" class="form-select">
            <option value="none" ${currentStatus === 'none' ? 'selected' : ''}>Sin conversión</option>
            <option value="trial_14_days" ${currentStatus === 'trial_14_days' ? 'selected' : ''}>🔄 Empezó 14 días gratis</option>
            <option value="paid_monthly_bonus" ${currentStatus === 'paid_monthly_bonus' ? 'selected' : ''}>💰 Pagó mensual con bonos</option>
            <option value="paid_after_trial" ${currentStatus === 'paid_after_trial' ? 'selected' : ''}>💰 Contrató después de trial</option>
          </select>

          <label for="conversion-notes">Notas (opcional):</label>
          <textarea id="conversion-notes" class="form-textarea" rows="3" placeholder="Agregar notas sobre la conversión..."></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary modal-cancel">Cancelar</button>
          <button class="btn-primary modal-save" data-phone="${phone}">Guardar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-save').addEventListener('click', async (e) => {
      const newStatus = modal.querySelector('#conversion-status').value;
      const notes = modal.querySelector('#conversion-notes').value;
      await this.updateConversionStatus(phone, newStatus, notes);
      modal.remove();
    });

    // Cerrar al hacer click fuera del modal
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  async updateConversionStatus(phone, conversionStatus, conversionNotes) {
    try {
      const response = await fetch(`/api/dashboard/leads/${encodeURIComponent(phone)}/conversion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversionStatus, conversionNotes }),
      });

      const { success, data } = await response.json();

      if (success) {
        alert('✅ Estado actualizado correctamente');
        this.loadLeadsPage(); // Recargar la tabla
      } else {
        throw new Error('Error actualizando estado');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('❌ Error actualizando estado');
    }
  }

  setupLeadsFilters() {
    const filterStatus = document.getElementById('filter-lead-status');
    const filterShopify = document.getElementById('filter-lead-shopify');

    if (filterStatus) {
      filterStatus.addEventListener('change', () => this.filterLeads());
    }

    if (filterShopify) {
      filterShopify.addEventListener('change', () => this.filterLeads());
    }
  }

  async filterLeads() {
    const status = document.getElementById('filter-lead-status').value;
    const shopify = document.getElementById('filter-lead-shopify').value;

    let url = '/api/dashboard/leads?limit=100';
    if (status && status !== 'all') url += `&status=${status}`;
    if (shopify === 'true') url += `&hasShopify=true`;

    try {
      const response = await fetch(url);
      const { data: leads } = await response.json();
      this.renderLeadsTable(leads);
    } catch (error) {
      console.error('Error filtrando leads:', error);
    }
  }
}

// Inicializar la aplicación cuando el DOM esté listo
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new DashboardApp();
});
