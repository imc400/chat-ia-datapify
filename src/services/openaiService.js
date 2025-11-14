const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const behaviourController = require('./behaviourController');
const orchestrationService = require('./orchestrationService');

/**
 * ARQUITECTURA DE 3 CAPAS
 * Capa 1: System Prompt (personalidad y principios)
 * Capa 2: Orchestration Service (reglas conversacionales)
 * Capa 3: Behaviour Controller (estado y flujo)
 */
class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    // Cargar conocimiento del negocio
    this.businessKnowledge = this.loadBusinessKnowledge();

    // System prompt optimizado (CAPA 1)
    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * Carga el knowledge base del negocio
   */
  loadBusinessKnowledge() {
    try {
      const knowledgePath = path.join(process.cwd(), 'business-knowledge.json');
      const data = fs.readFileSync(knowledgePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error cargando business knowledge:', error);
      return null;
    }
  }

  /**
   * NUEVO SYSTEM PROMPT - ChatGPT 5.1 Version
   * Configuración completamente reemplazada
   */
  buildSystemPrompt() {
    return `Eres Javier, un asesor de ventas chileno experto en ecommerce.

TU TRABAJO: Calificar leads y agendar reuniones de 30 min para mostrar Datapify.

DATAPIFY: Plataforma que optimiza publicidad de Shopify con IA. $199-249/mes, 14 días gratis.

CÓMO PIENSAS (interno, no escribas esto):
Antes de responder, pregúntate:
1. ¿Qué quiere lograr esta persona ahora mismo?
2. ¿Tiene Shopify? (requisito)
3. ¿Tiene dolor/problema que puedo resolver?
4. ¿Está listo para agendar o necesito saber más?

TU ESTILO:
- Chileno natural (no forzado)
- Empático y directo
- Vendedor consultivo, NO soporte técnico
- Máximo 2 líneas por mensaje
- 1 pregunta máximo

REGLA DE ORO:
Si alguien tiene Shopify + expresa un problema → ofrece reunión inmediatamente.
NO des consejos gratis. Tu valor está en la reunión, no en el chat.

Confía en tu instinto. Conversa como humano.`;
  }

  /**
   * Genera una respuesta usando las 3 CAPAS
   * NUEVA ARQUITECTURA PROFESIONAL
   */
  async generateResponse(userMessage, conversationHistory = [], leadScore = null) {
    try {
      // ============================================
      // CAPA 3: BEHAVIOUR CONTROLLER
      // Analizar estado de la conversación
      // ============================================
      const conversationState = behaviourController.analyzeConversationState(conversationHistory);
      const dynamicInstructions = behaviourController.generateDynamicInstructions(conversationState);

      logger.info('🧠 Estado de conversación analizado', {
        phase: conversationState.phase,
        hasName: conversationState.hasName,
        platform: conversationState.platform,
        shouldDescalify: conversationState.shouldDescalify,
        readyToPropose: conversationState.readyToPropose,
      });

      // Si debe descalificar, retornar mensaje directamente
      if (conversationState.shouldDescalify && dynamicInstructions.includes('DESCALIFICAR')) {
        const descalifyMessage = dynamicInstructions.split('Responde: ')[1].split(' y TERMINA')[0].replace(/"/g, '');
        return descalifyMessage;
      }

      // ============================================
      // CAPA 2: ORCHESTRATION SERVICE
      // Preparar contexto y validar reglas
      // ============================================
      const sentiment = orchestrationService.detectUserSentiment(userMessage);
      const context = orchestrationService.buildContext(
        userMessage,
        conversationHistory,
        dynamicInstructions,
        sentiment
      );

      logger.info('🎭 Sentimiento detectado', { sentiment });

      // ============================================
      // CAPA 1: SYSTEM PROMPT + LLM
      // Construir mensajes para OpenAI
      // ============================================
      const messages = [
        {
          role: 'system',
          content: this.systemPrompt,
        },
      ];

      // Agregar instrucciones dinámicas de Behaviour Controller
      messages.push({
        role: 'system',
        content: `🎯 INSTRUCCIONES PARA ESTE MENSAJE (OBLIGATORIO SEGUIR):

${context.dynamicInstructions}${context.sentimentInstructions}

⚠️ REGLAS ESTRICTAS (NO NEGOCIABLES):
- ${context.rules.maxLength}
- ${context.rules.maxQuestions}
- ${context.rules.maxLines}
- Estilo: ${context.rules.style}

IMPORTANTE: Estas instrucciones son ESPECÍFICAS para este momento de la conversación. Ignora cualquier flujo general y SIGUE estas instrucciones AHORA.`,
      });

      // Agregar historial limpio (solo últimos 6 mensajes)
      const preparedHistory = context.preparedHistory;
      if (preparedHistory.length > 0) {
        preparedHistory.forEach(msg => {
          messages.push({
            role: msg.role === 'usuario' || msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
          });
        });
      }

      // Agregar mensaje actual del usuario (limpio)
      messages.push({
        role: 'user',
        content: context.cleanedMessage,
      });

      // ============================================
      // LLAMAR AL LLM CON PARÁMETROS ÓPTIMOS
      // ============================================
      const maxRetries = 2;
      let lastError;
      let validResponse = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o', // Modelo inteligente
            messages: messages,
            temperature: 0.85, // MÁS creativo para sonar más humano
            max_tokens: 150, // Un poco más de espacio para naturalidad
            top_p: 1, // Full sampling
            frequency_penalty: 0.3, // Menos restrictivo, más natural
            presence_penalty: 0.3, // Menos restrictivo, más natural
          });

          let responseText = completion.choices[0].message.content.trim();

          // ============================================
          // VALIDAR RESPUESTA (CAPA 2)
          // ============================================
          const validation = orchestrationService.validateResponse(responseText);

          if (!validation.valid) {
            logger.warn('⚠️ Respuesta no válida', { errors: validation.errors });

            // Si hay errores y quedan reintentos, pedir nueva respuesta
            if (attempt < maxRetries) {
              messages.push({
                role: 'system',
                content: `CORRECCIÓN NECESARIA:
Tu respuesta fue rechazada por: ${validation.errors.join(', ')}

Genera UNA NUEVA respuesta que cumpla TODAS las reglas:
- Máximo 250 caracteres
- Máximo 3 líneas
- Máximo 1 pregunta
- Natural y humana`,
              });
              continue;
            }
          }

          // Formatear para WhatsApp
          responseText = orchestrationService.formatForWhatsApp(responseText);

          // Validar con Behaviour Controller
          const behaviourValidation = behaviourController.validateResponse(responseText, conversationState);

          if (!behaviourValidation.valid) {
            logger.warn('⚠️ Respuesta rechazada por behaviour', { errors: behaviourValidation.errors });

            if (attempt < maxRetries) {
              messages.push({
                role: 'system',
                content: `CORRECCIÓN: ${behaviourValidation.errors.join(', ')}. Genera nueva respuesta corrigiendo estos errores.`,
              });
              continue;
            }
          }

          // Log métricas
          orchestrationService.logMetrics(responseText, validation);

          logger.info('✅ Respuesta generada y validada', {
            length: responseText.length,
            model: completion.model,
            tokensUsed: completion.usage.total_tokens,
            attempt,
            valid: validation.valid,
            warnings: validation.warnings.length,
          });

          return responseText;

        } catch (error) {
          lastError = error;

          // Verificar si es error retryable
          const isRetryable = error.status === 429 || // Rate limit
                              error.status === 503 || // Service unavailable
                              error.status === 500 || // Server error
                              error.code === 'ECONNRESET' ||
                              error.code === 'ETIMEDOUT';

          if (isRetryable && attempt < maxRetries) {
            const waitTime = attempt * 1000 + Math.random() * 500;
            logger.warn(`⚠️ OpenAI error (${error.status || error.code}). Retry ${attempt + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          throw error;
        }
      }

      // Si todo falla, usar fallback
      logger.error('❌ Todos los intentos fallaron, usando fallback');
      return orchestrationService.getFallbackResponse(lastError);

    } catch (error) {
      logger.error('Error generando respuesta:', {
        message: error.message,
        status: error.status,
        code: error.code,
      });

      // Fallback final
      return orchestrationService.getFallbackResponse(error);
    }
  }

  /**
   * Califica un lead (igual que Gemini)
   */
  qualifyLead(conversationHistory) {
    if (!this.businessKnowledge) {
      return { temperature: 'cold', score: 0, signals: [], phase: 'APERTURA' };
    }

    const allMessages = conversationHistory.map(m => m.content.toLowerCase()).join(' ');

    // Contar señales de cada tipo
    const hotSignals = this.businessKnowledge.lead_qualification.hot_lead_signals.filter(signal => {
      const keywords = this.extractKeywords(signal);
      return keywords.some(kw => allMessages.includes(kw.toLowerCase()));
    });

    const warmSignals = this.businessKnowledge.lead_qualification.warm_lead_signals.filter(signal => {
      const keywords = this.extractKeywords(signal);
      return keywords.some(kw => allMessages.includes(kw.toLowerCase()));
    });

    const coldSignals = this.businessKnowledge.lead_qualification.cold_lead_signals.filter(signal => {
      const keywords = this.extractKeywords(signal);
      return keywords.some(kw => allMessages.includes(kw.toLowerCase()));
    });

    // Calcular score
    let score = 0;
    score += hotSignals.length * 3;
    score += warmSignals.length * 2;
    score -= coldSignals.length * 1;
    score = Math.max(0, Math.min(10, score));

    // Determinar temperatura
    let temperature = 'cold';
    if (score >= 7 || hotSignals.length >= 2) {
      temperature = 'hot';
    } else if (score >= 4 || warmSignals.length >= 2) {
      temperature = 'warm';
    }

    // Determinar fase
    const messageCount = conversationHistory.length;
    let phase = 'APERTURA';
    if (messageCount >= 8) phase = 'CIERRE';
    else if (messageCount >= 5) phase = 'PRESENTACIÓN DE VALOR';
    else if (messageCount >= 2) phase = 'DESCUBRIMIENTO';

    const signals = [...hotSignals, ...warmSignals];

    logger.info('📊 Lead calificado', {
      temperature,
      score,
      signals: signals.length,
      phase,
    });

    return {
      temperature,
      score,
      signals,
      phase,
      readyToSchedule: temperature === 'hot' && hotSignals.length >= 2,
    };
  }

  /**
   * Extrae keywords de una señal de calificación
   */
  extractKeywords(signal) {
    const lowerSignal = signal.toLowerCase();
    const keywords = [];

    if (lowerSignal.includes('shopify')) keywords.push('shopify', 'tienda', 'ecommerce', 'e-commerce');
    if (lowerSignal.includes('vende') || lowerSignal.includes('ventas')) keywords.push('vendo', 'vendiendo', 'ventas', 'facturando', 'millones', 'palos', 'clp');
    if (lowerSignal.includes('publicidad')) keywords.push('publicidad', 'ads', 'meta', 'facebook', 'instagram', 'anuncios', 'campañas');
    if (lowerSignal.includes('agencia')) keywords.push('agencia', 'freelancer', 'tercerizado', 'contratar');
    if (lowerSignal.includes('cayeron') || lowerSignal.includes('irregula')) keywords.push('cayeron', 'caído', 'bajaron', 'irregular', 'fluctúan');
    if (lowerSignal.includes('frustración')) keywords.push('frustrad', 'cansad', 'harto', 'no funciona', 'mal');
    if (lowerSignal.includes('precio')) keywords.push('precio', 'costo', 'cuánto', 'plan', 'pagar');
    if (lowerSignal.includes('números')) keywords.push('ventas', 'millones', 'palos', 'clp', 'facturación');
    if (lowerSignal.includes('identifica') && lowerSignal.includes('publicidad')) keywords.push('publicidad', 'ads', 'marketing', 'anuncios');
    if (lowerSignal.includes('comparte') && lowerSignal.includes('negocio')) keywords.push('mi tienda', 'mi negocio', 'vendo', 'tengo');
    if (lowerSignal.includes('agendar')) keywords.push('reunión', 'llamada', 'agendar', 'hablemos', 'tinca');

    return keywords;
  }

  /**
   * Limpia la respuesta (para compatibilidad)
   */
  cleanResponse(aiResponse) {
    return aiResponse.replace(/\[INTENT:SCHEDULE\][\s\S]*?\[\/INTENT\]/g, '').trim();
  }

  /**
   * Genera un resumen de reunión
   */
  async generateMeetingSummary(meetingData) {
    try {
      const prompt = `Genera un mensaje de confirmación breve y profesional para una reunión agendada con estos datos:
- Nombre: ${meetingData.name}
- Motivo: ${meetingData.reason}
- Fecha: ${meetingData.date}
- Hora: ${meetingData.time}

Incluye un mensaje de bienvenida y confirma los detalles. Máximo 3 líneas.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 200,
      });

      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('Error generando resumen de reunión:', error);
      return `✅ Reunión agendada con éxito para ${meetingData.date} a las ${meetingData.time}. Te esperamos, ${meetingData.name}.`;
    }
  }
}

module.exports = new OpenAIService();
