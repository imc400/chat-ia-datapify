const whatsappService = require('../services/whatsappService');
const geminiService = require('../services/geminiService');
const calendarService = require('../services/calendarService');
const config = require('../config');
const logger = require('../utils/logger');

// Almacenamiento temporal de sesiones (en producción usar Redis o DB)
const sessions = new Map();

class MessageController {
  /**
   * Procesa un mensaje entrante de WhatsApp
   */
  async processMessage(message, metadata) {
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

      // Obtener o crear sesión
      const session = this.getSession(from);

      // Agregar mensaje al historial
      session.history.push({
        role: 'usuario',
        content: userMessage,
      });

      // Calificar el lead basado en la conversación
      const leadScore = geminiService.qualifyLead(session.history);
      session.leadScore = leadScore;

      logger.info('🎯 Lead actualizado', {
        from,
        temperature: leadScore.temperature,
        score: leadScore.score,
        phase: leadScore.phase,
      });

      // Generar respuesta con Gemini (con contexto del lead)
      const aiResponse = await geminiService.generateResponse(
        userMessage,
        session.history.slice(-10), // Solo últimos 10 mensajes para contexto
        leadScore
      );

      // Limpiar respuesta
      const cleanResponse = geminiService.cleanResponse(aiResponse);

      // Agregar respuesta al historial
      session.history.push({
        role: 'asistente',
        content: cleanResponse,
        });

      // Enviar respuesta del agente
      await whatsappService.sendTextMessage(from, cleanResponse);

      // Verificar si el usuario está pidiendo el link directamente
      const askingForLink = userMessage.toLowerCase().includes('link') ||
                           userMessage.toLowerCase().includes('agendar') ||
                           userMessage.toLowerCase().includes('reunión');

      // Verificar si debe enviar link de agendamiento
      // Lo hacemos DESPUÉS de enviar la respuesta para mejor UX
      if (askingForLink || this.shouldSendBookingLink(userMessage, cleanResponse, leadScore)) {
        await this.sendBookingLink(from);
      }

      // Actualizar última actividad
      session.lastActivity = Date.now();

    } catch (error) {
      logger.error('Error procesando mensaje:', error);

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
   * Determina si debe enviar el link de agendamiento
   */
  shouldSendBookingLink(userMessage, agentResponse, leadScore) {
    // Solo para leads calientes
    if (leadScore.temperature !== 'hot') {
      return false;
    }

    // Palabras clave que indican aceptación de agendar
    const acceptanceKeywords = [
      'si', 'sí', 'dale', 'perfecto', 'ok', 'bueno', 'genial', 'demás',
      'claro', 'obvio', 'seguro', 'ya', 'sale', 'bakán', 'agend', 'reun'
    ];

    const userLower = userMessage.toLowerCase();
    const agentLower = agentResponse.toLowerCase();

    // Verificar si el usuario acepta y el agente está hablando de agendar
    const userAccepts = acceptanceKeywords.some(kw => userLower.includes(kw));
    const agentMentionsScheduling = agentLower.includes('agend') ||
      agentLower.includes('reuni') ||
      agentLower.includes('llam') ||
      agentLower.includes('convers') ||
      agentLower.includes('junt');

    return userAccepts && agentMentionsScheduling;
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
      const confirmationMessage = await geminiService.generateMeetingSummary(scheduleData);

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
   * Obtiene o crea una sesión de usuario
   */
  getSession(phone) {
    if (!sessions.has(phone)) {
      sessions.set(phone, {
        phone,
        history: [],
        leadScore: {
          temperature: 'cold',
          score: 0,
          signals: [],
          phase: 'APERTURA',
        },
        pendingIntent: null,
        lastEvent: null,
        lastActivity: Date.now(),
        createdAt: Date.now(),
      });

      logger.info('📝 Nueva sesión creada', { phone });
    }

    return sessions.get(phone);
  }

  /**
   * Limpia sesiones antiguas (ejecutar periódicamente)
   */
  cleanOldSessions() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas

    for (const [phone, session] of sessions.entries()) {
      if (now - session.lastActivity > maxAge) {
        sessions.delete(phone);
        logger.info('🧹 Sesión eliminada por inactividad', { phone });
      }
    }
  }
}

// Limpiar sesiones cada hora
setInterval(() => {
  const controller = new MessageController();
  controller.cleanOldSessions();
}, 60 * 60 * 1000);

module.exports = new MessageController();
