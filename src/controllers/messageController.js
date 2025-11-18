const whatsappService = require('../services/whatsappService');
const assistantService = require('../services/assistantService'); // 🤖 Sales Assistant (OpenAI)
const conversationService = require('../services/conversationService');
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

      // 3. OBTENER HISTORIAL DESDE BD (últimos 10 mensajes - contexto más rico)
      const history = await conversationService.getConversationHistory(conversation.id, 10);

      // 4. GENERAR RESPUESTA CON OPENAI ASSISTANT #1 (SALES AGENT)
      let aiResponse;

      logger.info('🤖 Llamando Sales Assistant...', {
        conversationId: conversation.id,
        assistantConfigured: !!process.env.OPENAI_ASSISTANT_ID,
      });

      try {
        aiResponse = await assistantService.generateResponse(
          userMessage,
          conversation.id,
          null // Ya no necesitamos pasar thinking analysis
        );
        logger.info('✅ Respuesta generada con Sales Assistant');
      } catch (error) {
        logger.error('❌ Error con Sales Assistant:', {
          error: error.message,
          stack: error.stack,
        });
        throw error; // No hay fallback, debe funcionar
      }

      // 5. ETIQUETADO AUTOMÁTICO CON ASSISTANT #2 (DATA TAGGER)
      // Ejecutar en paralelo, no bloqueante
      const dataTaggerService = require('../services/dataTaggerService');
      dataTaggerService.analyzeAndTag(userMessage, conversation.id, history)
        .catch(error => {
          logger.warn('⚠️ Error en Data Tagger (no crítico):', error.message);
        });

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

      // 8. LÓGICA DE AGENDAMIENTO - DESACTIVADA
      // El OpenAI Assistant ahora maneja 100% el flujo de agendamiento
      // incluyendo cuándo y cómo enviar el link de Calendly

      // Si el Assistant incluye explícitamente el link de Calendly en su respuesta,
      // se enviará automáticamente (ya está en aiResponse)

      // NOTA: La lógica automática anterior causaba que se enviara el link
      // prematuramente sin completar el método socrático de calificación.
      // Ahora el Assistant controla todo el proceso.

      logger.info('ℹ️ Agendamiento controlado por Assistant', {
        conversationId: conversation.id,
        responseIncludesCalendlyLink: aiResponse.includes('calendly.com'),
      });

      // 🧠 NOTA: La extracción de datos ahora ocurre ANTES de responder
      // mediante el Thinking Engine (líneas 51-95)
      // Ya no necesitamos extractAndSaveLeadData() después

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
   * Verifica si el usuario está confirmando que quiere agendar (OPTIMIZADO)
   * Más inteligente: detecta confirmación en diferentes contextos
   */
  userConfirmsScheduling(userMessage) {
    const confirmationKeywords = [
      // Confirmación directa
      'si', 'sí', 'sii', 'síi',
      'dale', 'ok', 'okay', 'oki', 'okey',
      'ya', 'claro', 'seguro', 'obvio',
      'perfecto', 'bueno', 'genial', 'excelente',
      'demás', 'sale', 'dale', 'va',
      'bakán', 'bacán', 'bakan',

      // Confirmación con acción
      'agend', // captura agendemos, agendamos, agendo, agendar
      'me tinca', 'tinca', 'me interesa',
      'coordinemos', 'hablemos', 'llamemos',
      'sí quiero', 'si quiero', 'quiero',
      'vamos', 'hagámoslo', 'hagamos',

      // Confirmación entusiasta
      'por supuesto', 'desde luego', 'sin duda',
      'adelante', 'tiremos',
    ];

    const userLower = userMessage.toLowerCase().trim();

    // 1. Mensaje completo es solo la keyword
    if (confirmationKeywords.some(kw => userLower === kw)) {
      return true;
    }

    // 2. Contiene keyword con contexto (espacios alrededor)
    if (confirmationKeywords.some(kw => {
      return userLower.includes(` ${kw} `) ||
             userLower.startsWith(`${kw} `) ||
             userLower.endsWith(` ${kw}`) ||
             userLower === kw;
    })) {
      return true;
    }

    // 3. Frases específicas de confirmación de reunión
    const confirmationPhrases = [
      'sí, agend', 'si agend', 'dale, agend',
      'quiero la reuni', 'quiero agendar',
      'dame el link', 'pásame el link', 'envíame el link',
      'me interesa la reuni', 'me interesa agendar',
    ];

    if (confirmationPhrases.some(phrase => userLower.includes(phrase))) {
      return true;
    }

    return false;
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
   * PERSONALIZADO con el dolor detectado del cliente
   */
  async sendBookingLink(phone, memory = null) {
    try {
      const bookingLink = config.googleCalendar.bookingLink;

      if (!bookingLink) {
        logger.warn('⚠️  GOOGLE_CALENDAR_BOOKING_LINK no está configurado');
        return;
      }

      // Generar mensaje personalizado según dolor detectado
      let message = '📅 ';

      if (memory && memory.painPoints && memory.painPoints.length > 0) {
        // Mapear pain points a mensajes más naturales
        const painPointsMap = {
          'no vendo': 'aumentar tus ventas',
          'ventas bajas': 'mejorar tus resultados',
          'no funciona': 'optimizar tu estrategia',
          'frustrado': 'resolver tus problemas de publicidad',
          'gasto mucho': 'reducir tu inversión y mejorar ROI',
          'pierdo plata': 'mejorar tu rentabilidad',
          'ads no funcionan': 'optimizar tus anuncios',
          'no compran': 'aumentar conversiones',
          'sin resultados': 'conseguir mejores resultados',
          'mal': 'mejorar tu situación',
        };

        // Encontrar el primer pain point que tengamos mapeado
        let painSolution = 'optimizar tu publicidad de Shopify';
        for (const pain of memory.painPoints) {
          if (painPointsMap[pain]) {
            painSolution = painPointsMap[pain];
            break;
          }
        }

        message += `Agenda aquí y vemos cómo te podemos ayudar con ${painSolution}:\n\n${bookingLink}`;
      } else {
        // Mensaje genérico si no hay dolor detectado
        message += `Perfecto! Acá puedes elegir el día y hora que más te acomode:\n\n${bookingLink}`;
      }

      await whatsappService.sendTextMessage(phone, message);

      logger.info('✅ Link de agendamiento enviado (personalizado)', {
        phone,
        hasPainPoints: memory?.painPoints?.length > 0,
        painPoints: memory?.painPoints || [],
      });

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

      // CRÍTICO: Solo analizar mensajes del USUARIO (no del agente)
      const userMessages = history.filter(h => h.role === 'user');
      const userText = userMessages.map(h => h.content.toLowerCase()).join(' ');

      // Extraer nombre (buscar "me llamo", "soy", etc)
      const namePatterns = [
        /me llamo (\w+)/i,
        /soy (\w+)/i,
        /mi nombre es (\w+)/i,
      ];

      for (const pattern of namePatterns) {
        const match = userText.match(pattern);
        if (match) {
          leadData.name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
          break;
        }
      }

      // ========================================
      // DETECCIÓN ROBUSTA DE SHOPIFY
      // Sistema de 3 capas con múltiples estrategias
      // ========================================

      // PASO 1: Normalizar texto (eliminar tildes, lowercase, trim)
      const normalizeText = (text) => {
        return text
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes
          .trim();
      };

      const normalizedText = normalizeText(userText);
      const words = normalizedText.split(/\s+/); // Separar por espacios

      // PASO 2: Verificar plataformas competidoras (descarta Shopify)
      const otherPlatforms = [
        'woocommerce',
        'woo commerce',
        'magento',
        'prestashop',
        'vtex',
        'jumpseller',
        'tienda nube',
        'mercado shops',
        'mercadoshops',
        'wordpress',
      ];

      const hasOtherPlatform = otherPlatforms.some(platform =>
        normalizedText.includes(platform)
      );

      if (hasOtherPlatform) {
        leadData.hasShopify = false;
        logger.info('🔍 Plataforma competidora detectada, marcando hasShopify=false', {
          phone: conversation.phone,
          text: userText.substring(0, 100)
        });
      }
      // PASO 3: Detección de Shopify con múltiples estrategias
      else if (normalizedText.includes('shopify')) {
        let isShopify = false;
        let detectionMethod = '';

        // Estrategia 1: Palabra única "shopify" o "Shopify"
        if (words.length === 1 && words[0] === 'shopify') {
          isShopify = true;
          detectionMethod = 'palabra_unica';
        }
        // Estrategia 2: Respuesta corta con shopify (máximo 5 palabras)
        else if (words.length <= 5 && words.includes('shopify')) {
          isShopify = true;
          detectionMethod = 'respuesta_corta';
        }
        // Estrategia 3: Frases confirmativas con shopify
        else if (
          normalizedText.includes('tengo shopify') ||
          normalizedText.includes('uso shopify') ||
          normalizedText.includes('con shopify') ||
          normalizedText.includes('en shopify') ||
          normalizedText.includes('mi shopify') ||
          normalizedText.includes('tienda shopify') ||
          normalizedText.includes('tienda en shopify') ||
          normalizedText.includes('tienda es shopify') ||
          normalizedText.match(/\bsi\b.*shopify/i) || // "si shopify", "sí, shopify"
          normalizedText.match(/shopify.*\bsi\b/i) || // "shopify sí"
          normalizedText.includes('esta en shopify') ||
          normalizedText.includes('esta con shopify')
        ) {
          isShopify = true;
          detectionMethod = 'frase_confirmativa';
        }
        // Estrategia 4: Shopify mencionado sin negación
        else if (
          normalizedText.includes('shopify') &&
          !normalizedText.includes('no uso') &&
          !normalizedText.includes('no tengo') &&
          !normalizedText.includes('no es') &&
          !normalizedText.includes('sin shopify') &&
          !normalizedText.includes('no shopify') &&
          words.length <= 15 // Respuestas relativamente cortas
        ) {
          isShopify = true;
          detectionMethod = 'mencion_sin_negacion';
        }

        if (isShopify) {
          leadData.hasShopify = true;
          logger.info('✅ SHOPIFY DETECTADO', {
            phone: conversation.phone,
            method: detectionMethod,
            text: userText.substring(0, 100),
            wordCount: words.length
          });
        }
      }

      // Detectar inversión en publicidad (solo si el USUARIO lo menciona)
      if (userText.includes('publicidad') || userText.includes('ads') || userText.includes('anuncios')) {
        leadData.investsInAds = true;
      }

      // Extraer tipo de negocio (solo de mensajes del USUARIO)
      const businessPatterns = [
        /vendo (\w+)/i,
        /tienda de (\w+)/i,
        /negocio de (\w+)/i,
      ];

      for (const pattern of businessPatterns) {
        const match = userText.match(pattern);
        if (match) {
          leadData.businessType = match[1];
          break;
        }
      }

      // Extraer ventas mensuales (millones, palos, clp) - solo de mensajes del USUARIO
      const revenuePatterns = [
        /(\d+)\s*millones/i,
        /(\d+)\s*palos/i,
        /(\d+)\s*clp/i,
      ];

      for (const pattern of revenuePatterns) {
        const match = userText.match(pattern);
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
