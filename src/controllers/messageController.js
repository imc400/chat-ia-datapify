const whatsappService = require('../services/whatsappService');
const aiService = require('../services/openaiService');
const assistantService = require('../services/assistantService'); // 🤖 NUEVO: OpenAI Assistant
const conversationService = require('../services/conversationService');
const calendarService = require('../services/calendarService');
const memoryService = require('../services/memoryService');
const thinkingEngine = require('../services/thinkingEngine'); // 🧠 NUEVO: Thinking Engine
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

      // 🧠 NUEVO: 4. ANÁLISIS PRE-RESPUESTA CON THINKING ENGINE
      // El agente PIENSA antes de responder, detectando información clave
      const thinkingAnalysis = await thinkingEngine.analyzeBeforeResponse(
        userMessage,
        history,
        conversation.leadData // leadData viene incluido en conversation
      );

      logger.info('🧠 Thinking Engine completado', {
        from,
        shopifyDetected: thinkingAnalysis.shopify.detected,
        shopifyConfidence: thinkingAnalysis.shopify.confidence,
        painLevel: thinkingAnalysis.pain.level,
        intent: thinkingAnalysis.intent.primary,
        isResumingAfterGap: thinkingAnalysis.temporal.isResumingAfterGap,
        timeSinceLastMessage: thinkingAnalysis.temporal.humanReadableGap,
      });

      // 5. GUARDAR DATOS DETECTADOS EN TIEMPO REAL (ANTES de responder)
      const leadDataUpdates = {};

      if (thinkingAnalysis.shopify.detected && thinkingAnalysis.shopify.confidence > 0.7) {
        leadDataUpdates.hasShopify = true;
        logger.info('✅ Shopify detectado y guardado ANTES de responder', {
          phone: from,
          method: thinkingAnalysis.shopify.method,
          confidence: thinkingAnalysis.shopify.confidence,
        });
      }

      // Guardar nombre si fue extraído
      if (thinkingAnalysis.leadInfo.name && !conversation.leadData?.name) {
        leadDataUpdates.name = thinkingAnalysis.leadInfo.name;
      }

      // Guardar tipo de negocio si fue extraído
      if (thinkingAnalysis.leadInfo.business && !conversation.leadData?.businessType) {
        leadDataUpdates.businessType = thinkingAnalysis.leadInfo.business;
      }

      // Guardar si hay actualizaciones
      if (Object.keys(leadDataUpdates).length > 0) {
        await conversationService.updateLeadData(conversation.id, leadDataUpdates);
      }

      // 6. CALIFICAR LEAD (usando el análisis del thinking engine)
      const leadScore = aiService.qualifyLead(history);
      await conversationService.updateLeadScore(conversation.id, leadScore);

      logger.info('🎯 Lead actualizado', {
        from,
        temperature: leadScore.temperature,
        score: leadScore.score,
        phase: leadScore.phase,
      });

      // 7. GENERAR RESPUESTA CON OPENAI ASSISTANT
      // Intenta usar Assistant API, fallback a chat completions si falla
      let aiResponse;

      logger.info('🔍 Intentando usar OpenAI Assistant...', {
        conversationId: conversation.id,
        assistantConfigured: !!process.env.OPENAI_ASSISTANT_ID,
      });

      try {
        aiResponse = await assistantService.generateResponse(
          userMessage,
          conversation.id,
          thinkingAnalysis // Opcional: pasa contexto del Thinking Engine
        );
        logger.info('✅ Respuesta generada con OpenAI Assistant');
      } catch (error) {
        logger.warn('⚠️ Error con Assistant API, usando fallback a chat completions', {
          error: error.message,
          stack: error.stack,
        });
        // Fallback al método anterior
        aiResponse = await aiService.generateResponseWithThinking(
          userMessage,
          history,
          thinkingAnalysis,
          leadScore
        );
        logger.info('✅ Respuesta generada con chat completions (fallback)');
      }

      const responseTime = Date.now() - startTime;

      // 8. GUARDAR RESPUESTA DEL ASISTENTE EN BD
      await conversationService.saveMessage(
        conversation.id,
        'assistant',
        aiResponse,
        null, // tokens (OpenAI no devuelve tokens en la respuesta)
        responseTime
      );

      // 9. ENVIAR RESPUESTA AL USUARIO
      await whatsappService.sendTextMessage(from, aiResponse);

      // 10. LÓGICA DE AGENDAMIENTO MEJORADA
      const userConfirms = this.userConfirmsScheduling(userMessage);

      // Verificar si el agente mencionó agendar/reunión en mensajes recientes
      const recentAssistantMessages = history
        .filter(h => h.role === 'assistant' || h.role === 'asistente')
        .slice(-3); // Últimos 3 mensajes del bot

      const agentAskedToSchedule = recentAssistantMessages.some(msg => {
        const text = msg.content.toLowerCase();
        return text.includes('agend') ||
               text.includes('reuni') ||
               text.includes('demo') ||
               text.includes('llama') ||
               text.includes('te tinca');
      });

      // Frases que indican que el bot va a pasar el link
      const agentConfirmedLink = aiResponse.toLowerCase().includes('te paso el link') ||
                                 aiResponse.toLowerCase().includes('te envío el link') ||
                                 aiResponse.toLowerCase().includes('te mando el link') ||
                                 aiResponse.toLowerCase().includes('te enviaré el link') ||
                                 aiResponse.toLowerCase().includes('para que elijas el día') ||
                                 aiResponse.toLowerCase().includes('enlace al calendario');

      // ENVIAR LINK SI:
      // 1. Usuario confirmó Y bot había preguntado por agendar
      // 2. O bot explícitamente dijo "te paso el link"

      // CRÍTICO: Verificar si ya se envió el link antes (prevenir duplicados)
      const linkAlreadySent = history.some(msg =>
        msg.role === 'system' && msg.content.includes('Link de agendamiento enviado')
      );

      if (linkAlreadySent) {
        logger.warn('⚠️ Link ya fue enviado previamente en esta conversación', {
          conversationId: conversation.id,
          phone: from
        });
      } else if ((agentAskedToSchedule && userConfirms) || agentConfirmedLink) {
        // Construir memoria conversacional para personalizar mensaje
        const memory = memoryService.buildConversationalMemory(history);

        logger.info('📅 Enviando link de agendamiento', {
          userConfirmed: userConfirms,
          agentAsked: agentAskedToSchedule,
          agentConfirmedLink: agentConfirmedLink,
          painPoints: memory.painPoints,
        });

        await this.sendBookingLink(from, memory);

        // Marcar conversación como pending (esperando agendamiento)
        await conversationService.completeConversation(
          conversation.id,
          'pending', // pending hasta que job de sync confirme agendamiento
          false
        );

        // Agregar mensaje del sistema para tracking
        await conversationService.saveMessage(
          conversation.id,
          'system',
          `📅 Link de agendamiento enviado. URL: ${config.googleCalendar.bookingLink}`,
          null,
          0
        );

        logger.info('✅ Link enviado y conversación marcada como pending', {
          conversationId: conversation.id,
          phone: from,
        });
      }

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
