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

    // Configurar botón de envío masivo
    this.setupMassMessageButton();

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
        } else if (targetPage === 'analytics') {
          this.loadAnalyticsFunnel();
        } else if (targetPage === 'campaigns') {
          this.loadCampaignsPage();
        }
      });
    });
  }

  /**
   * Método público para navegar programáticamente
   */
  navigateTo(page) {
    const targetNav = document.querySelector(`[data-page="${page}"]`);
    if (targetNav) {
      targetNav.click();
    }
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

      // CRÍTICO: Mostrar uniqueLeads (teléfonos únicos) en lugar de total (conversaciones totales)
      // Esto debe coincidir con el conteo de la pestaña Chat que agrupa por teléfono
      document.getElementById('stat-total').textContent = data.funnel.uniqueLeads;
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
      <div class="conversation-item ${conv.unreadCount > 0 ? 'unread' : ''}" data-phone="${conv.phone}">
        <div class="conversation-avatar ${this.getAvatarColor(conv)}">
          ${this.getAvatarInitials(conv)}
        </div>
        <div class="conversation-content">
          <div class="conversation-item-header">
            <span class="conversation-name">${conv.leadData?.name || this.formatPhone(conv.phone)}</span>
            <div class="conversation-header-right">
              ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ''}
              <span class="conversation-time">${this.formatTime(conv.lastMessage?.timestamp || conv.updatedAt)}</span>
            </div>
          </div>
          <div class="conversation-preview">
            ${this.renderMessagePreview(conv.lastMessage)}
          </div>
          <div class="conversation-meta">
            ${conv.leadData?.hasShopify ? '<span class="lead-badge shopify">Shopify</span>' : ''}
            ${conv.scheduledMeeting ? `<span class="meeting-badge">Agendado${conv.calendarEventCount > 1 ? ` (${conv.calendarEventCount})` : ''}</span>` : ''}
            ${conv.conversationCount > 1 ? `<span class="conversation-count-badge">${conv.conversationCount} conversaciones</span>` : ''}
          </div>
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
      const conversationItem = document.querySelector(`[data-phone="${phone}"]`);
      conversationItem.classList.add('active');

      // Marcar como leída (automáticamente)
      await this.markConversationAsRead(phone);

      // Remover badge de no leídos visualmente
      conversationItem.classList.remove('unread');
      const unreadBadge = conversationItem.querySelector('.unread-badge');
      if (unreadBadge) {
        unreadBadge.remove();
      }

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
          Información del Lead
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
            <span class="info-value">${calendarData.source === 'whatsapp_bot' ? 'WhatsApp Bot' : calendarData.source === 'google_appointment' ? 'Google Appointment' : 'Manual'}</span>
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
          <span class="info-value">${leadData.hasShopify === true ? 'Sí' : leadData.hasShopify === false ? 'No' : 'Desconocido'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Invierte en Ads:</span>
          <span class="info-value">${leadData.investsInAds ? 'Sí' : 'No'}</span>
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
          <span class="info-value">${summary.hasScheduledMeeting ? 'Sí' : 'No'}</span>
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
          Información del Lead
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
          <span class="info-value">${leadData.hasShopify === true ? 'Sí' : leadData.hasShopify === false ? 'No' : 'Desconocido'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Invierte en Ads:</span>
          <span class="info-value">${leadData.investsInAds ? 'Sí' : 'No'}</span>
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
   * Marcar conversación como leída
   */
  async markConversationAsRead(phone) {
    try {
      await fetch(`/api/dashboard/phone/${encodeURIComponent(phone)}/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error marcando conversación como leída:', error);
    }
  }

  /**
   * Auto-refresh cada 10 segundos
   */
  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.loadStats();
      this.loadConversations();

      // Si hay conversación seleccionada, recargarla
      if (this.currentConversation && this.currentConversation.phone) {
        this.selectConversationByPhone(this.currentConversation.phone);
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
      hot: 'Hot',
      warm: 'Warm',
      cold: 'Cold',
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
      scheduled: 'Reunión agendada',
      disqualified: 'Descalificado',
      abandoned: 'Abandonado',
      pending: 'Pendiente',
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

  /**
   * Renderizar preview del último mensaje con indicador de quién lo envió
   */
  renderMessagePreview(lastMessage) {
    if (!lastMessage) {
      return '<span class="no-messages">Sin mensajes</span>';
    }

    const isBot = lastMessage.role === 'assistant';
    const prefix = isBot
      ? '<span class="preview-sender">Agente:</span>'
      : '<span class="preview-sender-user">Tú:</span>';
    const truncated = this.truncate(lastMessage.content, 50);

    return `${prefix} ${this.escapeHtml(truncated)}`;
  }

  /**
   * Obtener iniciales para el avatar del lead
   */
  getAvatarInitials(conv) {
    if (conv.leadData?.name) {
      const names = conv.leadData.name.split(' ');
      if (names.length >= 2) {
        return (names[0][0] + names[1][0]).toUpperCase();
      }
      return names[0].substring(0, 2).toUpperCase();
    }
    // Si no hay nombre, usar últimos 2 dígitos del teléfono
    return conv.phone.slice(-2);
  }

  /**
   * Obtener color del avatar según estado del lead
   */
  getAvatarColor(conv) {
    if (conv.scheduledMeeting) return 'avatar-scheduled'; // Azul para agendados
    if (conv.leadData?.hasShopify) return 'avatar-shopify'; // Verde para Shopify
    if (conv.leadTemperature === 'hot') return 'avatar-hot'; // Rojo para hot leads
    if (conv.leadTemperature === 'warm') return 'avatar-warm'; // Naranja para warm
    return 'avatar-default'; // Gris por defecto
  }

  showError(message) {
    // Puedes implementar un toast o notificación
    console.error(message);
    alert(message);
  }

  /**
   * ==============================================
   * PÁGINA DE ANALYTICS - FUNNEL DE CONVERSIÓN
   * ==============================================
   */

  async loadAnalyticsFunnel() {
    try {
      const response = await fetch('/api/analytics/funnel');
      const { data } = await response.json();

      // Actualizar stats overview cards
      document.getElementById('funnel-total-chats').textContent = data.summary.totalLeads;
      document.getElementById('funnel-scheduled').textContent = data.summary.totalScheduled;
      document.getElementById('funnel-trial').textContent = data.summary.totalTrial;
      document.getElementById('funnel-paying').textContent = data.summary.totalConverted;

      // Actualizar funnel stages
      document.getElementById('stage-1-count').textContent = data.funnel.stage1_chats.count;

      document.getElementById('stage-2-count').textContent = data.funnel.stage2_scheduled.count;
      document.getElementById('stage-2-percentage').textContent = data.funnel.stage2_scheduled.percentage;
      document.getElementById('conversion-1-2').textContent = data.funnel.stage2_scheduled.conversionFromPrevious;

      document.getElementById('stage-3-count').textContent = data.funnel.stage3_trial.count;
      document.getElementById('stage-3-percentage').textContent = data.funnel.stage3_trial.percentage;

      document.getElementById('stage-4-count').textContent = data.funnel.stage4_paid_bonus.count;
      document.getElementById('stage-4-percentage').textContent = data.funnel.stage4_paid_bonus.percentage;
      document.getElementById('conversion-2-3').textContent = data.funnel.stage3_trial.conversionFromScheduled;

      document.getElementById('stage-5-count').textContent = data.funnel.stage5_paid_after_trial.count;
      document.getElementById('stage-5-percentage').textContent = data.funnel.stage5_paid_after_trial.percentage;
      document.getElementById('conversion-3-5').textContent = data.funnel.stage5_paid_after_trial.conversionFromTrial;

      document.getElementById('stage-6-count').textContent = data.funnel.stage6_trial_churn.count;
      document.getElementById('stage-6-percentage').textContent = data.funnel.stage6_trial_churn.percentage;

      // Actualizar conversion rates
      document.getElementById('rate-chat-schedule').textContent = data.conversionRates.chatToSchedule.rate;
      document.getElementById('desc-chat-schedule').textContent = data.conversionRates.chatToSchedule.description;

      document.getElementById('rate-schedule-conversion').textContent = data.conversionRates.scheduleToConversion.rate;
      document.getElementById('desc-schedule-conversion').textContent = data.conversionRates.scheduleToConversion.description;

      document.getElementById('rate-trial-payment').textContent = data.conversionRates.trialToPayment.rate;
      document.getElementById('desc-trial-payment').textContent = data.conversionRates.trialToPayment.description;

      document.getElementById('rate-trial-churn').textContent = data.conversionRates.trialChurn.rate;
      document.getElementById('desc-trial-churn').textContent = data.conversionRates.trialChurn.description;

      document.getElementById('rate-overall').textContent = data.conversionRates.overallConversion.rate;
      document.getElementById('desc-overall').textContent = data.conversionRates.overallConversion.description;

      // Actualizar revenue
      document.getElementById('revenue-paying').textContent = data.revenue.totalPaying;
      document.getElementById('revenue-per-client').textContent = data.revenue.revenuePerClient;
      document.getElementById('revenue-total').textContent = data.revenue.totalRevenue;
      document.getElementById('revenue-monthly').textContent = data.revenue.projectedMonthlyRevenue;

    } catch (error) {
      console.error('Error cargando funnel analytics:', error);
    }
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
        <div class="stat-icon"><svg class="icon"><use href="#icon-users"/></svg></div>
        <div class="stat-details">
          <div class="stat-label">Total Leads</div>
          <div class="stat-value">${stats.totalLeads}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg class="icon"><use href="#icon-campaigns"/></svg></div>
        <div class="stat-details">
          <div class="stat-label">Con Shopify</div>
          <div class="stat-value">${stats.metrics.withShopify}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg class="icon"><use href="#icon-funnel"/></svg></div>
        <div class="stat-details">
          <div class="stat-label">Agendados</div>
          <div class="stat-value">${stats.metrics.scheduled}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg class="icon"><use href="#icon-trending-up"/></svg></div>
        <div class="stat-details">
          <div class="stat-label">Pagaron</div>
          <div class="stat-value">${stats.metrics.totalPaid}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg class="icon"><use href="#icon-analytics"/></svg></div>
        <div class="stat-details">
          <div class="stat-label">Tasa de Conversión</div>
          <div class="stat-value">${stats.metrics.conversionRate}%</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg class="icon"><use href="#icon-refresh"/></svg></div>
        <div class="stat-details">
          <div class="stat-label">Trial 14 días</div>
          <div class="stat-value">${stats.byStatus.trial_14_days || 0}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg class="icon"><use href="#icon-x"/></svg></div>
        <div class="stat-details">
          <div class="stat-label">Trial sin conversión</div>
          <div class="stat-value">${stats.byStatus.trial_completed_no_payment || 0}</div>
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
              <td>${lead.hasShopify ? 'Sí' : 'No'}</td>
              <td>
                ${this.renderConversionStatusBadge(lead.conversionStatus)}
              </td>
              <td>${lead.scheduledMeeting ? `Sí (${lead.calendarEventCount})` : 'No'}</td>
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
      trial_14_days: '<span class="status-badge trial">Trial 14d</span>',
      trial_completed_no_payment: '<span class="status-badge churn">Trial sin pago</span>',
      paid_monthly_bonus: '<span class="status-badge paid">Mensual + Bonos</span>',
      paid_after_trial: '<span class="status-badge paid">Pagó post-trial</span>',
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
            <option value="trial_14_days" ${currentStatus === 'trial_14_days' ? 'selected' : ''}>Empezó 14 días gratis</option>
            <option value="trial_completed_no_payment" ${currentStatus === 'trial_completed_no_payment' ? 'selected' : ''}>NO contrató post-trial (churn)</option>
            <option value="paid_monthly_bonus" ${currentStatus === 'paid_monthly_bonus' ? 'selected' : ''}>Pagó mensual con bonos</option>
            <option value="paid_after_trial" ${currentStatus === 'paid_after_trial' ? 'selected' : ''}>Contrató después de trial</option>
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
        alert('Estado actualizado correctamente');
        this.loadLeadsPage(); // Recargar la tabla
      } else {
        throw new Error('Error actualizando estado');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error actualizando estado');
    }
  }

  setupLeadsFilters() {
    const filterStatus = document.getElementById('filter-lead-status');
    const filterShopify = document.getElementById('filter-lead-shopify');
    const filterScheduled = document.getElementById('filter-lead-scheduled');
    const filterResponse = document.getElementById('filter-lead-response');

    if (filterStatus) {
      filterStatus.addEventListener('change', () => this.filterLeads());
    }

    if (filterShopify) {
      filterShopify.addEventListener('change', () => this.filterLeads());
    }

    if (filterScheduled) {
      filterScheduled.addEventListener('change', () => this.filterLeads());
    }

    if (filterResponse) {
      filterResponse.addEventListener('change', () => this.filterLeads());
    }
  }

  async filterLeads() {
    const status = document.getElementById('filter-lead-status').value;
    const shopify = document.getElementById('filter-lead-shopify').value;
    const scheduled = document.getElementById('filter-lead-scheduled').value;
    const response = document.getElementById('filter-lead-response').value;

    let url = '/api/dashboard/leads?limit=100';
    if (status && status !== 'all') url += `&status=${status}`;
    if (shopify === 'true') url += `&hasShopify=true`;
    if (scheduled === 'true') url += `&scheduledMeeting=true`;
    if (scheduled === 'false') url += `&scheduledMeeting=false`;
    if (response === 'no-response') url += `&responseStatus=no-response`;
    if (response === 'active') url += `&responseStatus=active`;

    try {
      const fetchResponse = await fetch(url);
      const { data: leads } = await fetchResponse.json();
      this.renderLeadsTable(leads);
    } catch (error) {
      console.error('Error filtrando leads:', error);
    }
  }

  /**
   * ==============================================
   * ENVÍO MASIVO DE MENSAJES
   * ==============================================
   */

  setupMassMessageButton() {
    const btn = document.getElementById('btn-send-message');
    if (btn) {
      btn.addEventListener('click', () => this.showMassMessageModal());
    }
  }

  async showMassMessageModal() {
    // Crear modal
    const modal = document.createElement('div');
    modal.className = 'mass-message-modal';
    modal.id = 'mass-message-modal';

    modal.innerHTML = `
      <div class="mass-message-modal-content">
        <div class="mass-message-modal-header">
          <h3>Enviar Mensaje Masivo</h3>
          <button class="mass-message-modal-close">&times;</button>
        </div>
        <div class="mass-message-modal-body">
          <div id="message-status"></div>

          <!-- Nombre de campaña -->
          <div class="form-group">
            <label for="campaign-name">Nombre de la Campaña *</label>
            <input
              type="text"
              id="campaign-name"
              class="form-input"
              placeholder="Ej: Follow-up Shopify Noviembre 2024"
              maxlength="100"
              required
            />
            <small>Dale un nombre descriptivo para identificar esta campaña</small>
          </div>

          <!-- Formulario de mensaje -->
          <div class="form-group">
            <label for="mass-message-text">Mensaje *</label>
            <textarea
              id="mass-message-text"
              class="form-textarea"
              placeholder="Escribe tu mensaje aquí..."
              maxlength="1000"
              required
            ></textarea>
            <div class="char-counter" id="char-counter">0 / 1000 caracteres</div>
            <small>El mensaje se enviará exactamente como lo escribas, con saltos de línea incluidos.</small>
          </div>

          <!-- Filtros -->
          <div class="filter-section">
            <h4>Filtrar destinatarios</h4>
            <div class="filter-grid">
              <div class="filter-item">
                <label>Shopify</label>
                <select id="modal-filter-shopify">
                  <option value="">Todos</option>
                  <option value="true">Solo con Shopify</option>
                  <option value="false">Sin Shopify</option>
                </select>
              </div>
              <div class="filter-item">
                <label>Agendamiento</label>
                <select id="modal-filter-scheduled">
                  <option value="">Todos</option>
                  <option value="false">No agendaron</option>
                  <option value="true">Sí agendaron</option>
                </select>
              </div>
              <div class="filter-item">
                <label>Estado de conversión</label>
                <select id="modal-filter-status">
                  <option value="all">Todos</option>
                  <option value="not_started">Sin conversión</option>
                  <option value="trial_14_days">Trial 14 días</option>
                  <option value="paid_monthly_bonus">Pagando</option>
                </select>
              </div>
              <div class="filter-item">
                <label>Temperatura</label>
                <select id="modal-filter-temperature">
                  <option value="all">Todas</option>
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="cold">Cold</option>
                </select>
              </div>
              <div class="filter-item">
                <label>Actividad</label>
                <select id="modal-filter-response">
                  <option value="all">Todos</option>
                  <option value="no-response">Sin respuesta</option>
                  <option value="active">Activos</option>
                </select>
              </div>
            </div>
            <div style="margin-top: 12px;">
              <button id="btn-apply-filters" class="btn-secondary">Aplicar Filtros</button>
            </div>
          </div>

          <!-- Preview de destinatarios -->
          <div class="preview-section">
            <div class="preview-header">
              <h4>Destinatarios</h4>
              <span class="preview-count zero" id="preview-count">0 seleccionados</span>
            </div>
            <div class="recipients-list" id="recipients-list">
              <div class="empty-recipients">
                <div class="empty-recipients-icon"><svg class="icon"><use href="#icon-users"/></svg></div>
                <p>Haz clic en "Aplicar Filtros" para ver los destinatarios</p>
              </div>
            </div>
          </div>
        </div>
        <div class="mass-message-modal-footer">
          <div class="select-all-controls">
            <button class="btn-link" id="btn-select-all">Seleccionar todos</button>
            <button class="btn-link" id="btn-deselect-all">Deseleccionar todos</button>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" id="btn-cancel">Cancelar</button>
            <button class="btn-primary" id="btn-send" disabled>
              Enviar Mensaje
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    modal.querySelector('.mass-message-modal-close').addEventListener('click', () => this.closeMassMessageModal());
    modal.querySelector('#btn-cancel').addEventListener('click', () => this.closeMassMessageModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeMassMessageModal();
    });

    // Event listener para campo de nombre de campaña
    const campaignNameInput = modal.querySelector('#campaign-name');
    campaignNameInput.addEventListener('input', () => {
      this.updateSendButtonState();
    });

    // Contador de caracteres
    const textarea = modal.querySelector('#mass-message-text');
    const charCounter = modal.querySelector('#char-counter');
    textarea.addEventListener('input', () => {
      const length = textarea.value.length;
      charCounter.textContent = `${length} / 1000 caracteres`;

      if (length > 900) {
        charCounter.className = 'char-counter danger';
      } else if (length > 700) {
        charCounter.className = 'char-counter warning';
      } else {
        charCounter.className = 'char-counter';
      }

      this.updateSendButtonState();
    });

    // Botón aplicar filtros
    modal.querySelector('#btn-apply-filters').addEventListener('click', () => this.loadRecipients());

    // Botones select/deselect all
    modal.querySelector('#btn-select-all').addEventListener('click', () => this.selectAllRecipients(true));
    modal.querySelector('#btn-deselect-all').addEventListener('click', () => this.selectAllRecipients(false));

    // Botón enviar
    modal.querySelector('#btn-send').addEventListener('click', () => this.sendMassMessage());

    // Cargar destinatarios inicialmente con filtros por defecto
    setTimeout(() => this.loadRecipients(), 100);
  }

  closeMassMessageModal() {
    const modal = document.getElementById('mass-message-modal');
    if (modal) {
      modal.remove();
    }
  }

  async loadRecipients() {
    try {
      const hasShopify = document.getElementById('modal-filter-shopify').value;
      const scheduled = document.getElementById('modal-filter-scheduled').value;
      const conversionStatus = document.getElementById('modal-filter-status').value;
      const leadTemperature = document.getElementById('modal-filter-temperature').value;
      const responseStatus = document.getElementById('modal-filter-response').value;

      const filters = {
        hasShopify: hasShopify === 'true' ? true : hasShopify === 'false' ? false : undefined,
        scheduled: scheduled === 'true' ? true : scheduled === 'false' ? false : undefined,
        conversionStatus: conversionStatus !== 'all' ? conversionStatus : undefined,
        leadTemperature: leadTemperature !== 'all' ? leadTemperature : undefined,
        responseStatus: responseStatus !== 'all' ? responseStatus : undefined,
      };

      const response = await fetch('/api/dashboard/preview-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });

      const { data } = await response.json();
      this.renderRecipients(data.recipients);

    } catch (error) {
      console.error('Error cargando destinatarios:', error);
      this.showError('Error cargando destinatarios');
    }
  }

  renderRecipients(recipients) {
    const container = document.getElementById('recipients-list');

    if (recipients.length === 0) {
      container.innerHTML = `
        <div class="empty-recipients">
          <div class="empty-recipients-icon"><svg class="icon"><use href="#icon-search"/></svg></div>
          <p>No se encontraron destinatarios con estos filtros</p>
        </div>
      `;
      this.updateSendButtonState();
      return;
    }

    container.innerHTML = recipients.map(recipient => `
      <div class="recipient-item">
        <input
          type="checkbox"
          class="recipient-checkbox"
          data-phone="${recipient.phone}"
        >
        <div class="recipient-info">
          <span class="recipient-phone">${this.formatPhone(recipient.phone)}</span>
          <span class="recipient-name">${recipient.name}</span>
          <div class="recipient-badges">
            ${recipient.hasShopify ? '<span class="recipient-badge shopify">Shopify</span>' : ''}
            ${recipient.scheduledMeeting ? '<span class="recipient-badge scheduled">Agendado</span>' : ''}
            ${recipient.leadScore >= 8 ? '<span class="recipient-badge hot">Hot</span>' : ''}
          </div>
        </div>
      </div>
    `).join('');

    // Event listeners para checkboxes
    container.querySelectorAll('.recipient-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', () => this.updateSendButtonState());
    });

    this.updateSendButtonState();
  }

  selectAllRecipients(select) {
    const checkboxes = document.querySelectorAll('.recipient-checkbox');
    checkboxes.forEach(cb => cb.checked = select);
    this.updateSendButtonState();
  }

  updateSendButtonState() {
    const campaignName = document.getElementById('campaign-name')?.value || '';
    const message = document.getElementById('mass-message-text')?.value || '';
    const checkedBoxes = document.querySelectorAll('.recipient-checkbox:checked');
    const sendBtn = document.getElementById('btn-send');
    const countBadge = document.getElementById('preview-count');

    if (!sendBtn) return;

    const canSend = campaignName.trim().length > 0 && message.trim().length > 0 && checkedBoxes.length > 0;
    sendBtn.disabled = !canSend;

    // Actualizar contador
    if (countBadge) {
      countBadge.textContent = `${checkedBoxes.length} seleccionados`;
      countBadge.className = checkedBoxes.length > 0 ? 'preview-count' : 'preview-count zero';
    }
  }

  async sendMassMessage() {
    const campaignName = document.getElementById('campaign-name').value.trim();
    const message = document.getElementById('mass-message-text').value.trim();
    const checkedBoxes = document.querySelectorAll('.recipient-checkbox:checked');
    const phones = Array.from(checkedBoxes).map(cb => cb.dataset.phone);

    // Validaciones
    if (!campaignName) {
      alert('Debes ingresar un nombre para la campaña');
      return;
    }

    if (phones.length === 0 || !message) {
      alert('Debes escribir un mensaje y seleccionar al menos un destinatario');
      return;
    }

    // Obtener filtros aplicados
    const filters = {
      hasShopify: document.getElementById('modal-filter-shopify').value,
      hasScheduled: document.getElementById('modal-filter-scheduled').value,
      conversionStatus: document.getElementById('modal-filter-status').value,
      leadTemperature: document.getElementById('modal-filter-temperature').value,
    };

    // Confirmación
    const confirm = window.confirm(
      `¿Estás seguro de enviar este mensaje a ${phones.length} contacto${phones.length > 1 ? 's' : ''}?\n\n` +
      `Campaña: ${campaignName}\n\n` +
      `Los números son:\n${phones.slice(0, 5).map(p => this.formatPhone(p)).join('\n')}` +
      `${phones.length > 5 ? `\n... y ${phones.length - 5} más` : ''}`
    );

    if (!confirm) return;

    // Deshabilitar botón y mostrar loading
    const sendBtn = document.getElementById('btn-send');
    const originalText = sendBtn.textContent;
    sendBtn.disabled = true;
    sendBtn.innerHTML = `
      <span class="loading-indicator">
        <span class="loading-spinner"></span>
        Enviando...
      </span>
    `;

    try {
      const response = await fetch('/api/dashboard/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones,
          message,
          campaignName,
          filters,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const statusDiv = document.getElementById('message-status');
        statusDiv.innerHTML = `
          <div class="success-message">
            <span class="success-message-icon"><svg class="icon"><use href="#icon-check"/></svg></span>
            <div>
              <strong>Campaña "${result.data.campaignName}" creada correctamente</strong><br>
              <small>${result.data.summary.sent} enviados, ${result.data.summary.failed} fallidos (${result.data.summary.successRate}% éxito)</small><br>
              <small style="margin-top: 4px; display: block;">
                <a href="#campaigns" onclick="app.navigateTo('campaigns'); return false;" style="color: #3b82f6; text-decoration: underline;">
                  Ver detalles de la campaña →
                </a>
              </small>
            </div>
          </div>
        `;

        // Limpiar formulario
        document.getElementById('campaign-name').value = '';
        document.getElementById('mass-message-text').value = '';
        this.selectAllRecipients(false);

        // Cerrar modal después de 4 segundos
        setTimeout(() => this.closeMassMessageModal(), 4000);
      } else {
        throw new Error(result.error || 'Error desconocido');
      }

    } catch (error) {
      console.error('Error enviando mensajes:', error);
      const statusDiv = document.getElementById('message-status');
      statusDiv.innerHTML = `
        <div class="error-message">
          <span><svg class="icon"><use href="#icon-x"/></svg></span>
          <div>
            <strong>Error enviando mensajes</strong><br>
            <small>${error.message}</small>
          </div>
        </div>
      `;
      sendBtn.disabled = false;
      sendBtn.textContent = originalText;
    }
  }

  /**
   * ======================
   * CAMPAÑAS
   * ======================
   */

  async loadCampaignsPage() {
    try {
      const response = await fetch('/api/dashboard/campaigns');
      const result = await response.json();

      if (result.success) {
        this.renderCampaigns(result.data.campaigns);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error cargando campañas:', error);
      document.getElementById('campaigns-table').innerHTML = `
        <div class="error-message">
          <span><svg class="icon"><use href="#icon-x"/></svg></span>
          <div>
            <strong>Error cargando campañas</strong><br>
            <small>${error.message}</small>
          </div>
        </div>
      `;
    }
  }

  renderCampaigns(campaigns) {
    const container = document.getElementById('campaigns-table');

    if (campaigns.length === 0) {
      container.innerHTML = `
        <div class="empty-campaigns">
          <div class="empty-campaigns-icon"><svg class="icon"><use href="#icon-campaigns"/></svg></div>
          <h3>No hay campañas todavía</h3>
          <p>Crea tu primera campaña enviando un mensaje masivo desde la sección de Leads</p>
          <button class="btn-primary" onclick="app.navigateTo('leads')">
            Ir a Leads
          </button>
        </div>
      `;
      return;
    }

    const tableHTML = `
      <table class="campaigns-table">
        <thead>
          <tr>
            <th>Nombre de Campaña</th>
            <th>Fecha</th>
            <th>Destinatarios</th>
            <th>Enviados</th>
            <th>Fallidos</th>
            <th>Tasa de Éxito</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${campaigns.map(campaign => {
            const successRate = campaign.totalRecipients > 0
              ? ((campaign.sentCount / campaign.totalRecipients) * 100).toFixed(1)
              : 0;

            const statusBadge = campaign.status === 'completed'
              ? '<span class="status-badge success">Completada</span>'
              : campaign.status === 'sending'
              ? '<span class="status-badge warning">Enviando</span>'
              : '<span class="status-badge error">Error</span>';

            return `
              <tr>
                <td>
                  <div class="campaign-name">
                    <strong>${campaign.name}</strong>
                    <small>${campaign.message.substring(0, 50)}${campaign.message.length > 50 ? '...' : ''}</small>
                  </div>
                </td>
                <td>${new Date(campaign.createdAt).toLocaleString('es-CL', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</td>
                <td>${campaign.totalRecipients}</td>
                <td><span class="badge-success">${campaign.sentCount}</span></td>
                <td><span class="badge-error">${campaign.failedCount}</span></td>
                <td>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${successRate}%"></div>
                  </div>
                  <span class="progress-text">${successRate}%</span>
                </td>
                <td>${statusBadge}</td>
                <td>
                  <button class="btn-link" onclick="app.showCampaignDetail('${campaign.id}')">
                    Ver Detalle
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    container.innerHTML = tableHTML;
  }

  async showCampaignDetail(campaignId) {
    try {
      const response = await fetch(`/api/dashboard/campaigns/${campaignId}`);
      const result = await response.json();

      if (result.success) {
        this.renderCampaignDetailModal(result.data);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error cargando detalle de campaña:', error);
      alert('Error cargando detalle de campaña: ' + error.message);
    }
  }

  renderCampaignDetailModal(campaign) {
    // Crear modal
    const modal = document.createElement('div');
    modal.className = 'campaign-detail-modal';
    modal.id = 'campaign-detail-modal';

    const successRate = campaign.totalRecipients > 0
      ? ((campaign.sentCount / campaign.totalRecipients) * 100).toFixed(1)
      : 0;

    modal.innerHTML = `
      <div class="campaign-detail-modal-content">
        <div class="campaign-detail-header">
          <h3>${campaign.name}</h3>
          <button class="campaign-detail-close">&times;</button>
        </div>

        <div class="campaign-detail-body">
          <!-- Stats -->
          <div class="campaign-stats-grid">
            <div class="campaign-stat-card">
              <div class="stat-icon"><svg class="icon"><use href="#icon-users"/></svg></div>
              <div class="stat-value">${campaign.totalRecipients}</div>
              <div class="stat-label">Total Destinatarios</div>
            </div>
            <div class="campaign-stat-card success">
              <div class="stat-icon"><svg class="icon"><use href="#icon-check"/></svg></div>
              <div class="stat-value">${campaign.sentCount}</div>
              <div class="stat-label">Enviados</div>
            </div>
            <div class="campaign-stat-card error">
              <div class="stat-icon"><svg class="icon"><use href="#icon-x"/></svg></div>
              <div class="stat-value">${campaign.failedCount}</div>
              <div class="stat-label">Fallidos</div>
            </div>
            <div class="campaign-stat-card">
              <div class="stat-icon"><svg class="icon"><use href="#icon-trending-up"/></svg></div>
              <div class="stat-value">${successRate}%</div>
              <div class="stat-label">Tasa de Éxito</div>
            </div>
          </div>

          <!-- Mensaje -->
          <div class="campaign-message-box">
            <h4>Mensaje Enviado</h4>
            <pre>${campaign.message}</pre>
          </div>

          <!-- Filtros Aplicados -->
          ${campaign.filters ? `
            <div class="campaign-filters-box">
              <h4>Filtros Aplicados</h4>
              <div class="filters-tags">
                ${campaign.filters.hasShopify === 'true' ? '<span class="filter-tag">Con Shopify</span>' : ''}
                ${campaign.filters.hasShopify === 'false' ? '<span class="filter-tag">Sin Shopify</span>' : ''}
                ${campaign.filters.hasScheduled === 'true' ? '<span class="filter-tag">Agendaron</span>' : ''}
                ${campaign.filters.hasScheduled === 'false' ? '<span class="filter-tag">No agendaron</span>' : ''}
                ${campaign.filters.conversionStatus !== 'all' ? `<span class="filter-tag">Estado: ${campaign.filters.conversionStatus}</span>` : ''}
                ${campaign.filters.leadTemperature !== 'all' ? `<span class="filter-tag">${campaign.filters.leadTemperature}</span>` : ''}
              </div>
            </div>
          ` : ''}

          <!-- Lista de Destinatarios -->
          <div class="campaign-recipients-box">
            <h4>Destinatarios (${campaign.recipients.length})</h4>
            <div class="recipients-table-wrapper">
              <table class="recipients-detail-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Estado</th>
                    <th>Enviado</th>
                  </tr>
                </thead>
                <tbody>
                  ${campaign.recipients.map(recipient => {
                    const statusBadge = recipient.status === 'sent'
                      ? '<span class="status-badge success">Enviado</span>'
                      : recipient.status === 'failed'
                      ? '<span class="status-badge error">Fallido</span>'
                      : '<span class="status-badge">Pendiente</span>';

                    return `
                      <tr>
                        <td>${recipient.leadName || 'Sin nombre'}</td>
                        <td>${this.formatPhone(recipient.phone)}</td>
                        <td>${statusBadge}</td>
                        <td>${recipient.sentAt ? new Date(recipient.sentAt).toLocaleString('es-CL') : '-'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="campaign-detail-footer">
          <button class="btn-secondary" onclick="app.closeCampaignDetailModal()">
            Cerrar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    modal.querySelector('.campaign-detail-close').addEventListener('click', () => this.closeCampaignDetailModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeCampaignDetailModal();
    });
  }

  closeCampaignDetailModal() {
    const modal = document.getElementById('campaign-detail-modal');
    if (modal) {
      modal.remove();
    }
  }
}

// Inicializar la aplicación cuando el DOM esté listo
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new DashboardApp();
});
