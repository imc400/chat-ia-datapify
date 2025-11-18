const logger = require('../utils/logger');

/**
 * THINKING ENGINE - El "Cerebro" del Agente IA
 *
 * Este módulo implementa el Sistema de Pensamiento Deliberado que convierte
 * al agente de un "bot reactivo" a un "vendedor digital que piensa".
 *
 * FASE 1: ANÁLISIS PRE-RESPUESTA
 * Detecta información clave ANTES de que el agente responda, permitiendo
 * que la respuesta sea contextual e inteligente.
 *
 * Arquitectura:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Usuario: "Uso Shopify"
 *    ↓
 * [THINKING ENGINE] 🧠
 *    ├─ Análisis semántico profundo
 *    ├─ Detección: Shopify, dolor, intención
 *    ├─ Cálculo de confianza
 *    └─ Generación de contexto estratégico
 *    ↓
 * [AGENTE GENERA RESPUESTA CON CONTEXTO]
 *    ↓
 * Agente: "Bacán que uses Shopify! ¿Cómo te va con ads?"
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
class ThinkingEngine {
  constructor() {
    // Patrones semánticos para detección de Shopify
    this.shopifyPatterns = {
      // Confirmaciones explícitas (confianza: 0.95+)
      explicit: [
        /\b(uso|tengo|con|en|mi)\s+shopify\b/i,
        /\bshopify\s+(sí|si|es|uso|tengo)\b/i,
        /\btienda\s+(en|con|de)\s+shopify\b/i,
        /\bestá\s+(en|con)\s+shopify\b/i,
      ],

      // Respuestas cortas (confianza: 0.90)
      short: /^(sí|si|shopify|uso shopify|tengo shopify)$/i,

      // Palabra única (confianza: 0.85)
      single: /^shopify$/i,

      // Negaciones (confianza: 0, descalifica)
      negations: [
        /\bno\s+(uso|tengo|es|tenemos)\s+shopify\b/i,
        /\bsin\s+shopify\b/i,
        /\bno\s+shopify\b/i,
      ],

      // Competidores (confianza: 0, descalifica)
      competitors: [
        'woocommerce', 'woo commerce', 'magento', 'prestashop',
        'vtex', 'jumpseller', 'tienda nube', 'mercado shops',
        'mercadoshops', 'wordpress'
      ],
    };

    // Patrones de dolor/frustración
    this.painPatterns = {
      // Dolor explícito (nivel: high)
      high: [
        'no vendo', 'no estoy vendiendo', 'no logro vender',
        'no funciona', 'no me funciona', 'nada funciona',
        'frustrado', 'cansado', 'harto',
        'pierdo plata', 'pierdo dinero', 'gasto mucho',
        'cayeron las ventas', 'bajaron las ventas',
      ],

      // Dolor medio (nivel: medium)
      medium: [
        'no me va bien', 'me va mal', 'ventas bajas',
        'pocas ventas', 'resultados malos',
        'ads no funcionan', 'publicidad no funciona',
        'no veo resultados', 'sin resultados',
        'no compran', 'no me compran',
      ],

      // Señales tempranas (nivel: low)
      low: [
        'no sé', 'no lo sé', 'confundido',
        'necesito ayuda', 'me pueden ayudar',
        'quiero mejorar', 'quiero optimizar',
      ],
    };

    // Patrones de intención
    this.intentPatterns = {
      scheduling: [
        'sí', 'dale', 'ok', 'perfecto', 'agendemos',
        'coordinemos', 'me tinca', 'me interesa',
      ],
      questioning: [
        'cómo funciona', 'qué es', 'cuánto cuesta',
        'precio', 'planes', 'cuéntame más',
      ],
      objecting: [
        'no creo', 'no estoy seguro', 'no sé',
        'déjame pensarlo', 'después',
      ],
    };
  }

  /**
   * ANÁLISIS PRE-RESPUESTA COMPLETO
   * Este es el método principal que analiza el mensaje del usuario
   * ANTES de generar la respuesta.
   *
   * @param {string} userMessage - Último mensaje del usuario
   * @param {Array} conversationHistory - Historial completo
   * @param {Object} leadData - Datos del lead (si existen)
   * @returns {Object} - Análisis completo con confianza
   */
  async analyzeBeforeResponse(userMessage, conversationHistory, leadData = null) {
    const startTime = Date.now();

    logger.info('🧠 Thinking Engine: Iniciando análisis pre-respuesta', {
      messageLength: userMessage.length,
      historyLength: conversationHistory.length,
    });

    const analysis = {
      // Detección de Shopify
      shopify: this.detectShopify(userMessage, conversationHistory),

      // Detección de dolor/frustración
      pain: this.detectPain(userMessage, conversationHistory),

      // Detección de intención
      intent: this.detectIntent(userMessage),

      // Contexto conversacional
      context: this.analyzeContext(conversationHistory),

      // Datos estructurados del lead
      leadInfo: this.extractLeadInfo(userMessage, conversationHistory, leadData),

      // Contexto temporal (tiempo entre mensajes)
      temporal: this.analyzeTemporalContext(conversationHistory),

      // Observaciones contextuales (reemplaza "recomendaciones")
      observations: null, // Se calcula después

      // Metadata
      timestamp: new Date().toISOString(),
      processingTime: 0,
    };

    // Generar observaciones contextuales basadas en el análisis
    analysis.observations = this.generateObservations(analysis, userMessage);

    analysis.processingTime = Date.now() - startTime;

    logger.info('✅ Thinking Engine: Análisis completado', {
      hasShopify: analysis.shopify.detected,
      confidence: analysis.shopify.confidence,
      painLevel: analysis.pain.level,
      intent: analysis.intent.primary,
      timeSinceLastMessage: analysis.temporal.timeSinceLastUserMessage,
      processingTime: `${analysis.processingTime}ms`,
    });

    return analysis;
  }

  /**
   * DETECCIÓN SEMÁNTICA DE SHOPIFY
   * Usa múltiples estrategias para detectar si el usuario confirmó Shopify
   *
   * @returns {Object} { detected, confidence, method, evidence }
   */
  detectShopify(userMessage, history) {
    const normalized = this.normalizeText(userMessage);
    const words = normalized.split(/\s+/).filter(w => w.length > 0);

    // PASO 1: Verificar negaciones
    for (const pattern of this.shopifyPatterns.negations) {
      if (pattern.test(normalized)) {
        return {
          detected: false,
          confidence: 0.95,
          method: 'negation',
          evidence: userMessage,
          shouldDisqualify: true,
          reason: 'Usuario confirmó que NO usa Shopify',
        };
      }
    }

    // PASO 2: Verificar competidores
    for (const competitor of this.shopifyPatterns.competitors) {
      if (normalized.includes(competitor)) {
        return {
          detected: false,
          confidence: 0.90,
          method: 'competitor_detected',
          evidence: userMessage,
          shouldDisqualify: true,
          reason: `Usuario usa ${competitor} (no Shopify)`,
        };
      }
    }

    // PASO 3: Confirmaciones explícitas
    for (const pattern of this.shopifyPatterns.explicit) {
      if (pattern.test(normalized)) {
        return {
          detected: true,
          confidence: 0.95,
          method: 'explicit_confirmation',
          evidence: userMessage,
          shouldDisqualify: false,
          reason: 'Usuario confirmó explícitamente que usa Shopify',
        };
      }
    }

    // PASO 4: Palabra única "shopify"
    if (this.shopifyPatterns.single.test(normalized)) {
      return {
        detected: true,
        confidence: 0.85,
        method: 'single_word',
        evidence: userMessage,
        shouldDisqualify: false,
        reason: 'Respondió únicamente "Shopify"',
      };
    }

    // PASO 5: Respuesta corta con shopify (≤5 palabras)
    if (words.length <= 5 && normalized.includes('shopify')) {
      return {
        detected: true,
        confidence: 0.90,
        method: 'short_response',
        evidence: userMessage,
        shouldDisqualify: false,
        reason: 'Respuesta corta mencionando Shopify',
      };
    }

    // PASO 6: Menciona shopify en contexto neutro/positivo
    if (normalized.includes('shopify') && words.length <= 15) {
      return {
        detected: true,
        confidence: 0.70,
        method: 'mention_in_context',
        evidence: userMessage,
        shouldDisqualify: false,
        reason: 'Mencionó Shopify en contexto',
      };
    }

    // No detectado
    return {
      detected: false,
      confidence: 0,
      method: 'not_detected',
      evidence: null,
      shouldDisqualify: false,
      reason: 'No se mencionó Shopify',
    };
  }

  /**
   * DETECCIÓN DE DOLOR/FRUSTRACIÓN
   * Identifica el nivel de dolor del usuario
   */
  detectPain(userMessage, history) {
    const normalized = this.normalizeText(userMessage);
    const allText = history.map(h => h.content.toLowerCase()).join(' ');

    let level = 'none';
    let signals = [];
    let confidence = 0;

    // Analizar solo mensajes del usuario
    const userMessages = history
      .filter(h => h.role === 'user' || h.role === 'usuario')
      .map(h => h.content.toLowerCase());
    const userText = [...userMessages, userMessage.toLowerCase()].join(' ');

    // Detectar dolor alto
    for (const signal of this.painPatterns.high) {
      if (userText.includes(signal)) {
        signals.push(signal);
        level = 'high';
        confidence = 0.95;
      }
    }

    // Detectar dolor medio
    if (level === 'none') {
      for (const signal of this.painPatterns.medium) {
        if (userText.includes(signal)) {
          signals.push(signal);
          level = 'medium';
          confidence = 0.80;
        }
      }
    }

    // Detectar dolor bajo
    if (level === 'none') {
      for (const signal of this.painPatterns.low) {
        if (userText.includes(signal)) {
          signals.push(signal);
          level = 'low';
          confidence = 0.60;
        }
      }
    }

    return {
      level,
      confidence,
      signals: [...new Set(signals)], // Eliminar duplicados
      expressedInLastMessage: signals.some(s => normalized.includes(s)),
      overallFrustration: this.calculateFrustrationScore(signals),
    };
  }

  /**
   * DETECCIÓN DE INTENCIÓN
   * ¿Qué quiere hacer el usuario?
   */
  detectIntent(userMessage) {
    const normalized = this.normalizeText(userMessage);

    let primary = 'discovery'; // Por defecto
    let confidence = 0.5;
    let signals = [];

    // Scheduling intent
    if (this.intentPatterns.scheduling.some(p => normalized.includes(p))) {
      primary = 'scheduling';
      confidence = 0.90;
      signals.push('usuario_acepta_reunion');
    }

    // Questioning intent
    else if (this.intentPatterns.questioning.some(p => normalized.includes(p))) {
      primary = 'questioning';
      confidence = 0.85;
      signals.push('usuario_pregunta_info');
    }

    // Objecting intent
    else if (this.intentPatterns.objecting.some(p => normalized.includes(p))) {
      primary = 'objecting';
      confidence = 0.75;
      signals.push('usuario_objeta_duda');
    }

    return {
      primary,
      confidence,
      signals,
    };
  }

  /**
   * ANÁLISIS DE CONTEXTO CONVERSACIONAL
   * ¿En qué punto de la conversación estamos?
   */
  analyzeContext(history) {
    const messageCount = history.length;
    const userMessages = history.filter(h => h.role === 'user' || h.role === 'usuario');
    const assistantMessages = history.filter(h => h.role === 'assistant' || h.role === 'asistente');

    // Detectar qué preguntas ya se hicieron
    const questionsAsked = {
      name: assistantMessages.some(m =>
        m.content.toLowerCase().includes('llamo') ||
        m.content.toLowerCase().includes('tu nombre')
      ),
      platform: assistantMessages.some(m =>
        m.content.toLowerCase().includes('plataforma') ||
        m.content.toLowerCase().includes('shopify')
      ),
      business: assistantMessages.some(m =>
        m.content.toLowerCase().includes('qué vendes') ||
        m.content.toLowerCase().includes('qué vende')
      ),
      pain: assistantMessages.some(m =>
        m.content.toLowerCase().includes('cómo te va') ||
        m.content.toLowerCase().includes('publicidad') ||
        m.content.toLowerCase().includes('ventas')
      ),
      meeting: assistantMessages.some(m =>
        m.content.toLowerCase().includes('reunión') ||
        m.content.toLowerCase().includes('agendar') ||
        m.content.toLowerCase().includes('te tinca')
      ),
    };

    // Determinar fase de la conversación
    let phase = 'opening';
    if (messageCount >= 8) phase = 'closing';
    else if (messageCount >= 5) phase = 'qualification';
    else if (messageCount >= 2) phase = 'discovery';

    return {
      messageCount,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      questionsAsked,
      phase,
      avgUserMessageLength: userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length || 0,
      engagementLevel: this.calculateEngagement(userMessages),
    };
  }

  /**
   * EXTRACCIÓN DE INFORMACIÓN DEL LEAD
   * Nombre, negocio, revenue, etc.
   */
  extractLeadInfo(userMessage, history, existingLeadData) {
    const info = {
      name: existingLeadData?.name || null,
      business: existingLeadData?.businessType || null,
      hasOnlineStore: existingLeadData?.hasOnlineStore || null,
      investsInAds: existingLeadData?.investsInAds || null,
      monthlyRevenue: existingLeadData?.monthlyRevenueCLP || null,
    };

    const normalized = this.normalizeText(userMessage);

    // Extraer nombre (solo del último mensaje)
    const namePatterns = [
      /me llamo (\w+)/i,
      /soy (\w+)/i,
      /mi nombre es (\w+)/i,
    ];

    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        info.name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        break;
      }
    }

    // Extraer tipo de negocio
    const businessPatterns = [
      /vendo (\w+)/i,
      /tienda de (\w+)/i,
      /negocio de (\w+)/i,
    ];

    for (const pattern of businessPatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        info.business = match[1];
        break;
      }
    }

    // Detectar si invierte en publicidad
    if (normalized.includes('publicidad') || normalized.includes('ads') ||
        normalized.includes('anuncios') || normalized.includes('invierto')) {
      info.investsInAds = true;
    }

    return info;
  }

  /**
   * ANÁLISIS TEMPORAL
   * Analiza el tiempo transcurrido entre mensajes para entender el contexto temporal
   */
  analyzeTemporalContext(conversationHistory) {
    if (conversationHistory.length === 0) {
      return {
        timeSinceLastUserMessage: null,
        timeSinceConversationStart: null,
        isResumingAfterGap: false,
        gapDuration: null,
        conversationFreshness: 'new',
      };
    }

    const now = new Date();

    // Encontrar último mensaje del usuario
    const userMessages = conversationHistory
      .filter(m => m.role === 'user' || m.role === 'usuario')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const lastUserMessage = userMessages[0];
    const timeSinceLastUserMessage = lastUserMessage
      ? Math.floor((now - new Date(lastUserMessage.timestamp)) / 1000) // segundos
      : null;

    // Tiempo desde el primer mensaje
    const firstMessage = conversationHistory[0];
    const timeSinceStart = Math.floor((now - new Date(firstMessage.timestamp)) / 1000);

    // Detectar si hay un gap significativo (>1 hora)
    const oneHour = 3600;
    const sixHours = 21600;
    const twentyFourHours = 86400;

    let gapDuration = null;
    let isResumingAfterGap = false;
    let conversationFreshness = 'active';

    if (timeSinceLastUserMessage > twentyFourHours) {
      gapDuration = 'day_or_more';
      isResumingAfterGap = true;
      conversationFreshness = 'resumed_after_long_gap';
    } else if (timeSinceLastUserMessage > sixHours) {
      gapDuration = 'several_hours';
      isResumingAfterGap = true;
      conversationFreshness = 'resumed_after_hours';
    } else if (timeSinceLastUserMessage > oneHour) {
      gapDuration = 'over_an_hour';
      isResumingAfterGap = true;
      conversationFreshness = 'resumed_recently';
    } else if (timeSinceStart < 300) { // < 5 minutos
      conversationFreshness = 'very_fresh';
    }

    return {
      timeSinceLastUserMessage, // en segundos
      timeSinceConversationStart: timeSinceStart,
      isResumingAfterGap,
      gapDuration,
      conversationFreshness,
      humanReadableGap: this.formatTimeDuration(timeSinceLastUserMessage),
    };
  }

  /**
   * GENERACIÓN DE OBSERVACIONES CONTEXTUALES
   * Provee HECHOS y OBSERVACIONES, NO acciones prescriptivas
   * Permite que GPT-4o razone naturalmente
   */
  generateObservations(analysis, userMessage) {
    const { shopify, pain, intent, context, temporal } = analysis;
    const observations = {
      situacion: '',
      hechos_clave: [],
      observaciones: [],
      contexto_temporal: '',
      preguntas_reflexivas: [],
    };

    // SITUACIÓN ACTUAL
    if (temporal.isResumingAfterGap) {
      observations.situacion = `El usuario está retomando la conversación después de ${temporal.humanReadableGap}. Su último mensaje es: "${userMessage}"`;
    } else if (context.phase === 'opening') {
      observations.situacion = `Conversación recién iniciada. El usuario acaba de escribir: "${userMessage}"`;
    } else {
      observations.situacion = `Conversación activa en fase ${context.phase}. El usuario acaba de decir: "${userMessage}"`;
    }

    // HECHOS CLAVE
    if (shopify.detected) {
      observations.hechos_clave.push(`✅ Usuario confirmó que usa Shopify (confianza: ${(shopify.confidence * 100).toFixed(0)}%)`);
    } else if (shopify.shouldDisqualify) {
      observations.hechos_clave.push(`❌ Usuario NO usa Shopify: ${shopify.reason}`);
    } else {
      observations.hechos_clave.push(`⚠️ Plataforma aún desconocida`);
    }

    if (pain.level !== 'none') {
      observations.hechos_clave.push(`🔥 Dolor detectado: nivel ${pain.level} (señales: ${pain.signals.join(', ')})`);
    }

    if (analysis.leadInfo.name) {
      observations.hechos_clave.push(`👤 Nombre: ${analysis.leadInfo.name}`);
    }

    if (context.questionsAsked.meeting) {
      observations.hechos_clave.push(`📅 Ya se propuso una reunión anteriormente`);
    }

    // OBSERVACIONES CONTEXTUALES
    if (temporal.isResumingAfterGap && userMessage.toLowerCase().match(/^(hola|buenas|hey|holi|alo)\b/)) {
      observations.observaciones.push(
        `El usuario solo saludó después de ${temporal.humanReadableGap} de silencio. No expresó intención clara.`
      );
      observations.observaciones.push(
        'Posibles interpretaciones: (1) Retoma la conversación anterior, (2) Olvidó de qué hablábamos, (3) Tiene nueva consulta'
      );
    }

    if (shopify.detected && !pain.level) {
      observations.observaciones.push(
        'Usuario confirmó Shopify pero no ha expresado frustración o problemas todavía'
      );
    }

    if (shopify.detected && pain.level !== 'none' && !context.questionsAsked.meeting) {
      observations.observaciones.push(
        'Usuario califica como lead potencial: tiene Shopify y expresó problemas. No se le ha ofrecido reunión aún.'
      );
    }

    if (intent.primary === 'scheduling' && !context.questionsAsked.meeting) {
      observations.observaciones.push(
        'Usuario muestra señales de aceptación pero no se había propuesto reunión previamente. Posible falso positivo.'
      );
    }

    if (context.messageCount <= 3) {
      observations.observaciones.push(
        'Conversación muy temprana. Priorizar construcción de rapport sobre venta directa.'
      );
    }

    // CONTEXTO TEMPORAL
    if (temporal.isResumingAfterGap) {
      observations.contexto_temporal = `Pasaron ${temporal.humanReadableGap} desde el último mensaje. La conversación se había pausado.`;
    } else if (temporal.conversationFreshness === 'very_fresh') {
      observations.contexto_temporal = 'Conversación muy reciente, en tiempo real.';
    } else {
      observations.contexto_temporal = 'Conversación fluida sin pausas significativas.';
    }

    // PREGUNTAS REFLEXIVAS (para que GPT-4o piense)
    if (temporal.isResumingAfterGap && userMessage.toLowerCase().match(/^(hola|buenas|hey|holi|alo)\b/)) {
      observations.preguntas_reflexivas.push(
        '¿Qué haría un vendedor profesional cuando un lead saluda después de 24 horas sin contexto?'
      );
      observations.preguntas_reflexivas.push(
        '¿Es apropiado enviar un link de agenda inmediatamente, o primero debería re-establecer contexto?'
      );
    }

    if (shopify.detected && pain.level !== 'none') {
      observations.preguntas_reflexivas.push(
        '¿El lead está listo para una propuesta de reunión, o necesita más información primero?'
      );
    }

    if (!shopify.detected && context.messageCount >= 3) {
      observations.preguntas_reflexivas.push(
        '¿Por qué el usuario aún no mencionó su plataforma? ¿No le he preguntado claramente, o está evadiendo?'
      );
    }

    return observations;
  }

  /**
   * Formatea duración en formato humano
   */
  formatTimeDuration(seconds) {
    if (!seconds) return 'tiempo desconocido';

    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return `${seconds} segundo${seconds > 1 ? 's' : ''}`;
  }

  /**
   * UTILIDADES
   */

  normalizeText(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes
      .trim();
  }

  calculateFrustrationScore(signals) {
    if (signals.length >= 3) return 'high';
    if (signals.length >= 2) return 'medium';
    if (signals.length >= 1) return 'low';
    return 'none';
  }

  calculateEngagement(userMessages) {
    if (userMessages.length === 0) return 'low';

    const avgLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;

    if (avgLength > 50) return 'high';
    if (avgLength > 20) return 'medium';
    return 'low';
  }
}

module.exports = new ThinkingEngine();
