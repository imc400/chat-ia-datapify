const whatsappService = require('../services/whatsappService');
const aiService = require('../services/openaiService');
const conversationService = require('../services/conversationService');
const calendarService = require('../services/calendarService');
const config = require('../config');
const logger = require('../utils/logger');

class MessageController {
  /**
   * Procesa un mensaje entrante de WhatsApp
   * NUEVA VERSIÓN: Persiste TODO en base de datos para aprendizaje
   */
  async processMessage(message, metadata) {
    const startTime = Date.now();

    try {
      const from = message.from;
      const messageId = message.id;
      const messageType = message.type;

      // Marcar mensaje como leído
      await whatsappService.markAsRead(messageId);

      // Solo procesar mensajes de texto por ahora
      if (messageType !== 'text') {
        await whatsappService.sendTextMessage(
          from,
          'Por el momento solo puedo procesar mensajes de texto. ¿En qué puedo ayudarte?'
        );
        return;
      }

      const userMessage = message.text.body;

      logger.info('💬 Procesando mensaje', {
        from,
        message: userMessage,
      });

      // 1. OBTENER O CREAR CONVERSACIÓN (desde BD)
      const conversation = await conversationService.getOrCreateConversation(from);

      // 2. GUARDAR MENSAJE DEL USUARIO
      await conversationService.saveMessage(conversation.id, 'user', userMessage);

      // 3. OBTENER HISTORIAL DESDE BD (últimos 8 mensajes)
      const history = await conversationService.getConversationHistory(conversation.id, 8);

      // 4. CALIFICAR LEAD
      const leadScore = aiService.qualifyLead(history);
      await conversationService.updateLeadScore(conversation.id, leadScore);

      logger.info('🎯 Lead actualizado', {
        from,
        temperature: leadScore.temperature,
        score: leadScore.score,
        phase: leadScore.phase,
      });

      // 5. GENERAR RESPUESTA CON IA
      const aiResponse = await aiService.generateResponse(
        userMessage,
        history,
        leadScore
      );

      const responseTime = Date.now() - startTime;

      // 6. GUARDAR RESPUESTA DEL ASISTENTE EN BD
      await conversationService.saveMessage(
        conversation.id,
        'assistant',
        aiResponse,
        null, // tokens (OpenAI no devuelve tokens en la respuesta)
        responseTime
      );

      // 7. ENVIAR RESPUESTA AL USUARIO
      await whatsappService.sendTextMessage(from, aiResponse);

      // 8. LÓGICA DE AGENDAMIENTO
      const agentAskedToSchedule = aiResponse.toLowerCase().includes('agend') ||
                                   aiResponse.toLowerCase().includes('reuni') ||
                                   aiResponse.toLowerCase().includes('llam');

      const userConfirms = this.userConfirmsScheduling(userMessage);

      if (agentAskedToSchedule && userConfirms) {
        await this.sendBookingLink(from);

        // Marcar conversación como potencial agendamiento
        await conversationService.completeConversation(
          conversation.id,
          'pending', // pending hasta que confirmemos que agendó
          false
        );
      }

      // 9. EXTRACCIÓN AUTOMÁTICA DE DATOS DEL LEAD
      await this.extractAndSaveLeadData(conversation.id, history);

    } catch (error) {
      logger.error('Error procesando mensaje:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      // Enviar mensaje de error al usuario
      try {
        await whatsappService.sendTextMessage(
          message.from,
          'Lo siento, ocurrió un error procesando tu mensaje. Por favor intenta nuevamente.'
        );
      } catch (sendError) {
        logger.error('Error enviando mensaje de error:', sendError);
      }
    }
  }

  /**
   * Verifica si el usuario está confirmando que quiere agendar
   * Más estricto: solo palabras de confirmación clara
   */
  userConfirmsScheduling(userMessage) {
    const confirmationKeywords = [
      'si', 'sí', 'dale', 'ok', 'okay', 'ya', 'claro', 'seguro',
      'perfecto', 'bueno', 'genial', 'demás', 'sale', 'obvio',
      'bakán', 'agendemos', 'agendamos', 'agendo', 'me tinca'
    ];

    const userLower = userMessage.toLowerCase().trim();

    // Verificar si el mensaje del usuario contiene confirmación
    return confirmationKeywords.some(kw => {
      // Mensaje completo es solo la keyword (ej: "si", "dale")
      if (userLower === kw) return true;
      // O contiene la keyword con espacio (para evitar falsos positivos)
      if (userLower.includes(` ${kw} `) || userLower.startsWith(`${kw} `) || userLower.endsWith(` ${kw}`)) return true;
      return false;
    });
  }

  /**
   * LEGACY - Determina si debe enviar el link de agendamiento (ya no se usa)
   */
  shouldSendBookingLink(userMessage, agentResponse, leadScore) {
    // Esta función ya no se usa, se mantiene por compatibilidad
    return false;
  }

  /**
   * Envía el link de agendamiento de Google Calendar
   */
  async sendBookingLink(phone) {
    try {
      const bookingLink = config.googleCalendar.bookingLink;

      if (!bookingLink) {
        logger.warn('⚠️  GOOGLE_CALENDAR_BOOKING_LINK no está configurado');
        return;
      }

      const message = `📅 Perfecto! Acá puedes elegir el día y hora que más te acomode:\n\n${bookingLink}\n\n¿Alguna pregunta antes de agendar?`;

      await whatsappService.sendTextMessage(phone, message);

      logger.info('✅ Link de agendamiento enviado', { phone });

    } catch (error) {
      logger.error('Error enviando link de agendamiento:', error.message || error);
      logger.error('Stack trace:', error.stack);
    }
  }

  /**
   * Maneja la solicitud de agendamiento (LEGACY - Ya no se usa)
   */
  async handleScheduleRequest(phone, scheduleData, session) {
    try {
      logger.info('📅 Procesando solicitud de agendamiento', {
        phone,
        scheduleData,
      });

      // Verificar disponibilidad
      const availability = await calendarService.checkAvailability(
        scheduleData.date,
        scheduleData.time
      );

      if (!availability.available) {
        // Horario no disponible
        const message = `Lo siento, ${availability.reason}.\n\n¿Te gustaría ver otros horarios disponibles?`;

        await whatsappService.sendButtonMessage(
          phone,
          message,
          [
            { id: 'see_slots', title: 'Ver horarios' },
            { id: 'try_another', title: 'Proponer otro' },
          ]
        );

        return;
      }

      // Crear evento en el calendario
      const event = await calendarService.createEvent({
        name: scheduleData.name,
        reason: scheduleData.reason,
        date: scheduleData.date,
        time: scheduleData.time,
        phone: phone,
      });

      // Guardar en sesión
      session.lastEvent = event;

      // Generar mensaje de confirmación
      const confirmationMessage = await aiService.generateMeetingSummary(scheduleData);

      // Enviar confirmación
      await whatsappService.sendTextMessage(
        phone,
        `${confirmationMessage}\n\n🔗 Link del evento: ${event.eventLink}`
      );

      logger.info('✅ Reunión agendada exitosamente', {
        phone,
        eventId: event.eventId,
      });

      // Limpiar intención de la sesión
      session.pendingIntent = null;

    } catch (error) {
      logger.error('Error agendando reunión:', error);

      await whatsappService.sendTextMessage(
        phone,
        `Lo siento, no pude agendar la reunión: ${error.message}\n\nPor favor intenta con otra fecha u horario.`
      );
    }
  }

  /**
   * Muestra horarios disponibles al usuario
   */
  async showAvailableSlots(phone) {
    try {
      const slots = await calendarService.getAvailableSlots(7, 3);

      if (slots.length === 0) {
        await whatsappService.sendTextMessage(
          phone,
          'Lo siento, no hay horarios disponibles en los próximos días. Por favor contáctanos directamente.'
        );
        return;
      }

      // Agrupar por fecha
      const slotsByDate = {};
      slots.forEach(slot => {
        if (!slotsByDate[slot.date]) {
          slotsByDate[slot.date] = [];
        }
        slotsByDate[slot.date].push(slot);
      });

      // Crear secciones para el mensaje de lista
      const sections = Object.entries(slotsByDate).map(([date, dateSlots]) => ({
        title: dateSlots[0].displayDate,
        rows: dateSlots.map(slot => ({
          id: `slot_${slot.date}_${slot.time}`,
          title: slot.displayTime,
          description: `Disponible`,
        })),
      }));

      await whatsappService.sendListMessage(
        phone,
        'Aquí están los horarios disponibles:',
        'Ver horarios',
        sections.slice(0, 10) // WhatsApp limita a 10 secciones
      );

    } catch (error) {
      logger.error('Error mostrando horarios:', error);
      await whatsappService.sendTextMessage(
        phone,
        'Lo siento, ocurrió un error obteniendo los horarios disponibles.'
      );
    }
  }

  /**
   * Extrae y guarda automáticamente datos del lead desde la conversación
   */
  async extractAndSaveLeadData(conversationId, history) {
    try {
      const leadData = {};
      const allText = history.map(h => h.content.toLowerCase()).join(' ');

      // Extraer nombre (buscar "me llamo", "soy", etc)
      const namePatterns = [
        /me llamo (\w+)/i,
        /soy (\w+)/i,
        /mi nombre es (\w+)/i,
      ];

      for (const pattern of namePatterns) {
        const match = allText.match(pattern);
        if (match) {
          leadData.name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
          break;
        }
      }

      // Detectar Shopify
      if (allText.includes('shopify')) {
        leadData.hasShopify = allText.includes('sí') || allText.includes('si') || allText.includes('tengo shopify');
      }

      // Detectar inversión en publicidad
      if (allText.includes('publicidad') || allText.includes('ads') || allText.includes('anuncios')) {
        leadData.investsInAds = true;
      }

      // Extraer tipo de negocio
      const businessPatterns = [
        /vendo (\w+)/i,
        /tienda de (\w+)/i,
        /negocio de (\w+)/i,
      ];

      for (const pattern of businessPatterns) {
        const match = allText.match(pattern);
        if (match) {
          leadData.businessType = match[1];
          break;
        }
      }

      // Extraer ventas mensuales (millones, palos, clp)
      const revenuePatterns = [
        /(\d+)\s*millones/i,
        /(\d+)\s*palos/i,
        /(\d+)\s*clp/i,
      ];

      for (const pattern of revenuePatterns) {
        const match = allText.match(pattern);
        if (match) {
          const amount = parseInt(match[1]) * 1000000; // Convertir a CLP
          leadData.monthlyRevenueCLP = BigInt(amount);
          break;
        }
      }

      // Solo guardar si hay datos para actualizar
      if (Object.keys(leadData).length > 0) {
        await conversationService.updateLeadData(conversationId, leadData);
      }
    } catch (error) {
      logger.error('Error extrayendo datos del lead:', error);
      // No lanzar error para no interrumpir el flujo
    }
  }
}

module.exports = new MessageController();
