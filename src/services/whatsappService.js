const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.baseUrl = `${config.whatsapp.baseUrl}/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}`;
    this.headers = {
      'Authorization': `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Envía un mensaje de texto simple
   */
  async sendTextMessage(to, text) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      };

      const response = await axios.post(
        `${this.baseUrl}/messages`,
        payload,
        { headers: this.headers }
      );

      logger.info('✅ Mensaje enviado', {
        to,
        messageId: response.data.messages[0].id,
      });

      return response.data;
    } catch (error) {
      logger.error('Error enviando mensaje:', {
        to,
        error: error.response?.data || error.message,
      });
      throw error;
    }
  }

  /**
   * Envía un mensaje con botones interactivos
   */
  async sendButtonMessage(to, bodyText, buttons) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: bodyText,
          },
          action: {
            buttons: buttons.map((btn, index) => ({
              type: 'reply',
              reply: {
                id: btn.id || `btn_${index}`,
                title: btn.title.substring(0, 20), // Máximo 20 caracteres
              },
            })),
          },
        },
      };

      const response = await axios.post(
        `${this.baseUrl}/messages`,
        payload,
        { headers: this.headers }
      );

      logger.info('✅ Mensaje con botones enviado', {
        to,
        messageId: response.data.messages[0].id,
      });

      return response.data;
    } catch (error) {
      logger.error('Error enviando mensaje con botones:', {
        to,
        error: error.response?.data || error.message,
      });
      throw error;
    }
  }

  /**
   * Envía un mensaje con lista de opciones
   */
  async sendListMessage(to, bodyText, buttonText, sections) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: bodyText,
          },
          action: {
            button: buttonText,
            sections: sections,
          },
        },
      };

      const response = await axios.post(
        `${this.baseUrl}/messages`,
        payload,
        { headers: this.headers }
      );

      logger.info('✅ Mensaje con lista enviado', {
        to,
        messageId: response.data.messages[0].id,
      });

      return response.data;
    } catch (error) {
      logger.error('Error enviando mensaje con lista:', {
        to,
        error: error.response?.data || error.message,
      });
      throw error;
    }
  }

  /**
   * Marca un mensaje como leído
   */
  async markAsRead(messageId) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      };

      await axios.post(
        `${this.baseUrl}/messages`,
        payload,
        { headers: this.headers }
      );

      logger.info('✅ Mensaje marcado como leído', { messageId });
    } catch (error) {
      logger.error('Error marcando mensaje como leído:', {
        messageId,
        error: error.response?.data || error.message,
      });
    }
  }

  /**
   * Envía indicador de escritura (typing...)
   */
  async sendTypingIndicator(to) {
    try {
      // WhatsApp Cloud API no tiene typing indicator oficial
      // Esta función se deja preparada para futuras implementaciones
      logger.debug('Typing indicator (no disponible en Cloud API)', { to });
    } catch (error) {
      logger.error('Error enviando typing indicator:', error);
    }
  }
}

module.exports = new WhatsAppService();
