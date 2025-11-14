const logger = require('../utils/logger');

/**
 * CAPA 2: Orchestration Service
 * Gestiona reglas conversacionales y formato
 * Controla límites, formato, y políticas del agente
 */
class OrchestrationService {
  constructor() {
    // Configuración de reglas conversacionales
    this.rules = {
      maxTokensPerResponse: 120, // Mensajes cortos para WhatsApp
      maxHistoryMessages: 6, // Solo últimos 6 mensajes relevantes
      maxQuestions: 1, // Máximo 1 pregunta por mensaje
      maxLines: 3, // Máximo 3 líneas
      maxCharacters: 250, // Máximo 250 caracteres
      maxRetries: 2, // Reintentos si respuesta no cumple reglas
      responseTimeout: 10000, // 10 segundos max para generar
    };

    // Palabras bloqueadas (spam, vendedor, robot)
    this.blockedPhrases = [
      'espero haberte ayudado',
      'estoy aquí para ayudarte',
      '¿hay algo más',
      'es un placer',
      'no dudes en',
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
   * Valida si una respuesta cumple con las reglas
   */
  validateResponse(response) {
    const errors = [];
    const warnings = [];

    // Validar longitud
    if (response.length > this.rules.maxCharacters) {
      errors.push(`Respuesta muy larga: ${response.length} caracteres (máx ${this.rules.maxCharacters})`);
    }

    // Validar líneas
    const lines = response.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > this.rules.maxLines) {
      errors.push(`Demasiadas líneas: ${lines.length} (máx ${this.rules.maxLines})`);
    }

    // Validar preguntas
    const questionMarks = (response.match(/\?/g) || []).length;
    if (questionMarks > this.rules.maxQuestions) {
      errors.push(`Demasiadas preguntas: ${questionMarks} (máx ${this.rules.maxQuestions})`);
    }

    // Validar frases bloqueadas (suena a bot)
    this.blockedPhrases.forEach(phrase => {
      if (response.toLowerCase().includes(phrase)) {
        warnings.push(`Frase robótica detectada: "${phrase}"`);
      }
    });

    // Validar que no sea vacío
    if (response.trim().length === 0) {
      errors.push('Respuesta vacía');
    }

    // Validar que no tenga solo emojis
    const textWithoutEmojis = response.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    if (textWithoutEmojis.length < 10) {
      errors.push('Respuesta solo tiene emojis o muy poco texto');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      response,
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
   * Construye el contexto completo para el LLM
   */
  buildContext(userMessage, history, dynamicInstructions, sentiment) {
    return {
      cleanedMessage: this.cleanUserMessage(userMessage),
      preparedHistory: this.prepareHistory(history),
      dynamicInstructions: dynamicInstructions,
      sentimentInstructions: this.getSentimentInstructions(sentiment),
      rules: {
        maxLength: `Máximo ${this.rules.maxCharacters} caracteres`,
        maxQuestions: `Máximo ${this.rules.maxQuestions} pregunta`,
        maxLines: `Máximo ${this.rules.maxLines} líneas`,
        style: 'Natural, humano, conversacional',
      },
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
