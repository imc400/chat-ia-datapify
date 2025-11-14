const logger = require('../utils/logger');

/**
 * CAPA 2: Orchestration Service
 * Gestiona reglas conversacionales y formato
 * Controla límites, formato, y políticas del agente
 */
class OrchestrationService {
  constructor() {
    // Configuración de reglas conversacionales (OPTIMIZADAS - más flexible)
    this.rules = {
      maxTokensPerResponse: 150, // Más espacio para naturalidad
      maxHistoryMessages: 10, // Contexto más rico (últimos 10 mensajes)
      maxQuestions: 2, // Hasta 2 preguntas si tiene sentido (ej: nombre y plataforma)
      maxLines: 5, // Hasta 5 líneas para respuestas sustanciales
      maxCharacters: 400, // 400 caracteres (más natural, menos telegráfico)
      maxRetries: 2, // Reintentos si respuesta no cumple reglas
      responseTimeout: 15000, // 15 segundos (modelo más creativo)
    };

    // Reglas FLEX para fases críticas (HOT LEAD o PROPUESTA)
    this.flexRules = {
      maxCharacters: 500, // Más espacio en momento de cierre
      maxLines: 6,
      maxQuestions: 2,
    };

    // Palabras bloqueadas (spam, vendedor, robot)
    this.blockedPhrases = [
      'espero haberte ayudado',
      'estoy aquí para ayudarte',
      '¿hay algo más en lo que pueda',
      'es un placer ayudarte',
      'no dudes en contactarme',
      'para servirte',
    ];
  }

  /**
   * Limpia y optimiza el historial antes de enviarlo al LLM
   * Solo envía lo esencial
   */
  prepareHistory(history) {
    // Tomar solo los últimos N mensajes
    const recentHistory = history.slice(-this.rules.maxHistoryMessages);

    // Limpiar mensajes muy largos
    const cleanedHistory = recentHistory.map(msg => ({
      role: msg.role,
      content: this.truncateMessage(msg.content, 300), // Máx 300 chars por mensaje histórico
      timestamp: msg.timestamp,
    }));

    return cleanedHistory;
  }

  /**
   * Trunca un mensaje si es muy largo
   */
  truncateMessage(message, maxLength) {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  }

  /**
   * Valida si una respuesta cumple con las reglas (OPTIMIZADO - contexto-aware)
   * @param {string} response - Respuesta a validar
   * @param {object} context - Contexto conversacional (fase, etc)
   */
  validateResponse(response, context = {}) {
    const errors = [];
    const warnings = [];

    // Elegir reglas según contexto (flex para HOT LEAD o PROPUESTA)
    const isFlexPhase = context.phase === 'PROPUESTA' ||
                        context.phase === 'CIERRE' ||
                        context.interventionMoment === true;

    const activeRules = isFlexPhase ? this.flexRules : this.rules;

    // Validar longitud (más permisivo)
    if (response.length > activeRules.maxCharacters) {
      errors.push(`Respuesta muy larga: ${response.length} caracteres (máx ${activeRules.maxCharacters})`);
    }

    // Validar líneas (más permisivo)
    const lines = response.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > activeRules.maxLines) {
      errors.push(`Demasiadas líneas: ${lines.length} (máx ${activeRules.maxLines})`);
    }

    // Validar preguntas (permitir 2 en fases tempranas)
    const questionMarks = (response.match(/\?/g) || []).length;
    if (questionMarks > activeRules.maxQuestions) {
      errors.push(`Demasiadas preguntas: ${questionMarks} (máx ${activeRules.maxQuestions})`);
    }

    // Validar frases bloqueadas (solo WARNING, no bloquear)
    this.blockedPhrases.forEach(phrase => {
      if (response.toLowerCase().includes(phrase)) {
        warnings.push(`Frase robótica detectada: "${phrase}"`);
      }
    });

    // Validar que no sea vacío
    if (response.trim().length === 0) {
      errors.push('Respuesta vacía');
    }

    // Validar que no tenga solo emojis (más permisivo: mín 5 caracteres)
    const textWithoutEmojis = response.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    if (textWithoutEmojis.length < 5) {
      errors.push('Respuesta solo tiene emojis o muy poco texto');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      response,
      rulesUsed: isFlexPhase ? 'flex' : 'normal',
    };
  }

  /**
   * Formatea la respuesta para WhatsApp
   * Limpia caracteres raros, formatos incorrectos, etc.
   */
  formatForWhatsApp(response) {
    let formatted = response;

    // Remover saltos de línea excesivos
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    // Remover espacios al inicio/fin
    formatted = formatted.trim();

    // Remover markdown innecesario (WhatsApp no lo renderiza bien)
    formatted = formatted.replace(/\*\*/g, ''); // Bold
    formatted = formatted.replace(/\*/g, ''); // Italic
    formatted = formatted.replace(/~~(.*?)~~/g, '$1'); // Strikethrough

    // Asegurar que termina en punto o pregunta
    if (!['.', '?', '!', ':)'].some(char => formatted.endsWith(char))) {
      formatted += '.';
    }

    return formatted;
  }

  /**
   * Maneja errores y genera respuesta de fallback
   */
  getFallbackResponse(error) {
    logger.error('Error generando respuesta, usando fallback:', error);

    const fallbacks = [
      'Perdón, no entendí bien. ¿Me puedes explicar de nuevo?',
      'Disculpa, ¿podrías reformular eso?',
      'No caché bien, ¿me lo dices de nuevo?',
    ];

    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /**
   * Detecta si el usuario está confundido o frustrado
   */
  detectUserSentiment(message) {
    const messageLower = message.toLowerCase();

    // Frustración
    const frustrationKeywords = ['no funciona', 'mal', 'frustrad', 'cansad', 'harto', 'no entiendo', 'no me sirve'];
    if (frustrationKeywords.some(kw => messageLower.includes(kw))) {
      return 'frustrated';
    }

    // Confusión
    const confusionKeywords = ['no entiendo', 'qué', 'cómo', 'no cacho', 'no sé'];
    if (confusionKeywords.some(kw => messageLower.includes(kw))) {
      return 'confused';
    }

    // Entusiasmo
    const enthusiasmKeywords = ['excelente', 'genial', 'perfecto', 'me encanta', 'súper', 'bacán'];
    if (enthusiasmKeywords.some(kw => messageLower.includes(kw))) {
      return 'enthusiastic';
    }

    // Apurado
    const urgentKeywords = ['rápido', 'apurado', 'urgente', 'ahora', 'ya'];
    if (urgentKeywords.some(kw => messageLower.includes(kw))) {
      return 'urgent';
    }

    return 'neutral';
  }

  /**
   * Genera instrucciones adicionales según el sentimiento
   */
  getSentimentInstructions(sentiment) {
    switch (sentiment) {
      case 'frustrated':
        return '\n\nIMPORTANTE: Usuario frustrado. Empatiza primero, valida su frustración, luego ayuda.';
      case 'confused':
        return '\n\nIMPORTANTE: Usuario confundido. Explica de forma MÁS simple y clara.';
      case 'enthusiastic':
        return '\n\nIMPORTANTE: Usuario entusiasmado. Celebra con él y mantén la energía positiva.';
      case 'urgent':
        return '\n\nIMPORTANTE: Usuario apurado. Sé directo, ve al grano, sin rodeos.';
      default:
        return '';
    }
  }

  /**
   * Limpia el mensaje del usuario
   */
  cleanUserMessage(message) {
    // Remover espacios extras
    let cleaned = message.trim();

    // Convertir múltiples signos de pregunta/exclamación a uno solo
    cleaned = cleaned.replace(/\?+/g, '?');
    cleaned = cleaned.replace(/!+/g, '!');

    return cleaned;
  }

  /**
   * Construye el contexto completo para el LLM (OPTIMIZADO)
   * Reglas dinámicas según fase conversacional
   */
  buildContext(userMessage, history, dynamicInstructions, sentiment, conversationState = {}) {
    // Determinar si usar reglas flex
    const isFlexPhase = conversationState.phase === 'PROPUESTA' ||
                        conversationState.phase === 'CIERRE' ||
                        conversationState.interventionMoment === true;

    const activeRules = isFlexPhase ? this.flexRules : this.rules;

    return {
      cleanedMessage: this.cleanUserMessage(userMessage),
      preparedHistory: this.prepareHistory(history),
      dynamicInstructions: dynamicInstructions,
      sentimentInstructions: this.getSentimentInstructions(sentiment),
      rules: {
        maxLength: `Máximo ${activeRules.maxCharacters} caracteres`,
        maxQuestions: `Máximo ${activeRules.maxQuestions} preguntas`,
        maxLines: `Máximo ${activeRules.maxLines} líneas`,
        style: 'Natural, conversacional, humano (NO robótico)',
      },
      phase: conversationState.phase || 'APERTURA',
      isFlexPhase,
    };
  }

  /**
   * Log de métricas para análisis
   */
  logMetrics(response, validationResult) {
    logger.info('📊 Métricas de respuesta', {
      length: response.length,
      lines: response.split('\n').filter(l => l.trim().length > 0).length,
      questions: (response.match(/\?/g) || []).length,
      valid: validationResult.valid,
      errors: validationResult.errors.length,
      warnings: validationResult.warnings.length,
    });
  }
}

module.exports = new OrchestrationService();
