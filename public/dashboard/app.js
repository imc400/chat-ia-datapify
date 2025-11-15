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

    // Filtro por temperatura
    document.getElementById('filter-temperature').addEventListener('change', (e) => {
      this.loadConversations(e.target.value);
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
   * Renderizar lista de conversaciones
   */
  renderConversations(conversations) {
    const container = document.getElementById('conversations-list');

    if (conversations.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay conversaciones</div>';
      return;
    }

    container.innerHTML = conversations.map(conv => `
      <div class="conversation-item" data-id="${conv.id}">
        <div class="conversation-item-header">
          <span class="conversation-phone">${this.formatPhone(conv.phone)}</span>
          <span class="conversation-time">${this.formatTime(conv.updatedAt)}</span>
        </div>
        <div class="conversation-preview">
          ${conv.lastMessage ? this.truncate(conv.lastMessage.content, 60) : 'Sin mensajes'}
        </div>
        <div class="conversation-meta">
          <span class="lead-badge ${conv.leadTemperature}">${this.formatTemperature(conv.leadTemperature)}</span>
          ${conv.scheduledMeeting ? '<span class="meeting-badge">📅 Reunión</span>' : ''}
        </div>
      </div>
    `).join('');

    // Agregar event listeners después de renderizar
    container.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectConversation(item.dataset.id);
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
   * Seleccionar una conversación y cargar sus mensajes
   */
  async selectConversation(conversationId) {
    try {
      // Marcar como activa
      document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
      });
      document.querySelector(`[data-id="${conversationId}"]`).classList.add('active');

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
    `;
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
}

// Inicializar la aplicación cuando el DOM esté listo
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new DashboardApp();
});
