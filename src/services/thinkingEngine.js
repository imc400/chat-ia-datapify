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

      // Recomendación estratégica
      recommendation: null, // Se calcula después

      // Metadata
      timestamp: new Date().toISOString(),
      processingTime: 0,
    };

    // Generar recomendación basada en el análisis
    analysis.recommendation = this.generateRecommendation(analysis);

    analysis.processingTime = Date.now() - startTime;

    logger.info('✅ Thinking Engine: Análisis completado', {
      hasShopify: analysis.shopify.detected,
      confidence: analysis.shopify.confidence,
      painLevel: analysis.pain.level,
      intent: analysis.intent.primary,
      recommendation: analysis.recommendation.action,
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
   * GENERACIÓN DE RECOMENDACIÓN ESTRATÉGICA
   * ¿Qué debe hacer el agente ahora?
   */
  generateRecommendation(analysis) {
    const { shopify, pain, intent, context } = analysis;

    // CASO 1: Usuario confirmó Shopify + tiene dolor → OFRECER REUNIÓN
    if (shopify.detected && shopify.confidence > 0.8 && pain.level !== 'none') {
      return {
        action: 'propose_meeting',
        priority: 'high',
        reasoning: 'Usuario confirmó Shopify y expresó dolor/problema. Es un hot lead.',
        nextQuestion: '¿Te tinca una llamada de 30 min para ver cómo te podemos ayudar?',
        shouldTag: true,
        tags: ['shopify', 'pain_detected', 'qualified'],
      };
    }

    // CASO 2: Usuario confirmó Shopify pero NO expresó dolor → CALIFICAR
    if (shopify.detected && shopify.confidence > 0.8 && pain.level === 'none' && !context.questionsAsked.pain) {
      return {
        action: 'qualify_pain',
        priority: 'high',
        reasoning: 'Usuario tiene Shopify pero no sabemos si tiene problemas. Necesitamos calificar.',
        nextQuestion: '¿Cómo te va con las ventas? ¿Inviertes en publicidad?',
        shouldTag: true,
        tags: ['shopify', 'needs_qualification'],
      };
    }

    // CASO 3: Usuario NO usa Shopify → DESCALIFICAR
    if (shopify.shouldDisqualify) {
      return {
        action: 'disqualify',
        priority: 'high',
        reasoning: shopify.reason,
        nextQuestion: null,
        shouldTag: true,
        tags: ['not_shopify', 'disqualified'],
      };
    }

    // CASO 4: Usuario expresó dolor pero NO confirmó plataforma → PREGUNTAR PLATAFORMA
    if (pain.level !== 'none' && !shopify.detected && !context.questionsAsked.platform) {
      return {
        action: 'ask_platform',
        priority: 'critical',
        reasoning: 'Usuario expresó dolor pero no sabemos si usa Shopify. DEBE preguntar plataforma AHORA.',
        nextQuestion: '¿En qué plataforma está tu tienda? ¿Shopify, WooCommerce...?',
        shouldTag: false,
        tags: ['pain_detected', 'platform_unknown'],
      };
    }

    // CASO 5: Usuario acepta reunión → PASAR LINK
    if (intent.primary === 'scheduling' && context.questionsAsked.meeting) {
      return {
        action: 'send_calendar_link',
        priority: 'high',
        reasoning: 'Usuario aceptó la reunión. Enviar link de calendario.',
        nextQuestion: null,
        shouldTag: false,
        tags: ['scheduling_accepted'],
      };
    }

    // CASO 6: Conversación recién empieza → DESCUBRIR
    if (context.phase === 'opening' || context.phase === 'discovery') {
      return {
        action: 'discover',
        priority: 'medium',
        reasoning: 'Conversación en fase temprana. Descubrir información del lead.',
        nextQuestion: null, // El agente decidirá
        shouldTag: false,
        tags: ['discovery_phase'],
      };
    }

    // DEFAULT: Continuar conversación natural
    return {
      action: 'continue_conversation',
      priority: 'low',
      reasoning: 'Continuar conversación natural.',
      nextQuestion: null,
      shouldTag: false,
      tags: [],
    };
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
