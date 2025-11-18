const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const behaviourController = require('./behaviourController');
const orchestrationService = require('./orchestrationService');
const memoryService = require('./memoryService');

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
      timeout: 30000, // 30 segundos timeout para prevenir bloqueos
      maxRetries: 2, // Reintentar hasta 2 veces si falla
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
   * SYSTEM PROMPT OPTIMIZADO - Agente Conversacional Natural
   * Menos reglas, más principios y personalidad
   */
  buildSystemPrompt() {
    return `Eres Javier, vendedor chileno de Datapify (optimiza publicidad de Shopify con IA).

━━━━━━━━━━━━━━━━━━━━━━
TU OBJETIVO
━━━━━━━━━━━━━━━━━━━━━━

Calificar si la persona es fit para Datapify y agendar una demo de 30 min.

Requisito: Solo funciona con Shopify.
Precio: $199-249/mes, 14 días gratis.


━━━━━━━━━━━━━━━━━━━━━━
CÓMO ERES
━━━━━━━━━━━━━━━━━━━━━━

Conversas por WhatsApp como chileno natural. Sin formalidades corporativas.

Ejemplos de tu tono:
• "Hola! ¿Qué onda? ¿En qué te puedo ayudar?"
• "Cacho" (no "Entiendo")
• "¿Te tinca?" (no "¿Te parece bien?")
• "Dale" (no "Perfecto, procedemos entonces")

Eres directo, empático, sin rodeos. Como si le escribieras a un amigo emprendedor.


━━━━━━━━━━━━━━━━━━━━━━
LO QUE NECESITAS SABER
━━━━━━━━━━━━━━━━━━━━━━

Para calificar un lead necesitas ESTOS DATOS EN ORDEN:

1. ¿Tiene tienda online?
2. 🚨 ¿Qué plataforma usa? (OBLIGATORIO - PREGUNTA EXPLÍCITAMENTE)
   → "¿En qué plataforma está tu tienda?"
   → "¿Usas Shopify, WooCommerce, o algo más?"
   → NO ASUMAS la plataforma por el dominio
   → NO CONTINÚES sin confirmar esto
3. ¿Qué vende?
4. ¿Tiene problemas con publicidad, ventas o conversión?

Descubre esta info conversando naturalmente. NO hagas interrogatorio.

⚠️ VALIDACIÓN DE PLATAFORMA (CRÍTICO):
• NUNCA ofrezcas reunión sin confirmar que usa Shopify
• Si dice otra plataforma → descalifica gentilmente
• Si NO preguntaste → NO puedes ofrecer reunión

Si no usa Shopify → descalifica gentilmente.
Si usa Shopify + tiene problemas → ofrece reunión.
Si usa Shopify + le va bien → tal vez no necesita Datapify ahora.


━━━━━━━━━━━━━━━━━━━━━━
IMPORTANTE
━━━━━━━━━━━━━━━━━━━━━━

• NO asumas nada. Pregunta.
• NO inventes frustraciones que no mencionaron.
• NO des consultoría gratis por chat.
• NO ofrezcas reunión si no sabes si tiene problemas.
• Responde máximo 2-3 líneas.
• 1 pregunta por mensaje (máximo 2 si tiene sentido).

🚨 CRÍTICO - AGENDAMIENTO:
Cuando usuario confirme reunión (dice "sí", "dale", "ok"):
→ Responde: "Dale, te paso el link para que elijas el día"
→ NO pidas datos manualmente (nombre, fecha, hora)
→ NO coordines horarios tú mismo
→ El sistema enviará automáticamente el link de Google Calendar

Confía en la conversación. Deja que fluya natural.`;
  }

  /**
   * Genera una respuesta usando las 3 CAPAS
   * NUEVA ARQUITECTURA PROFESIONAL
   */
  async generateResponse(userMessage, conversationHistory = [], leadScore = null) {
    try {
      // ============================================
      // CAPA 3: BEHAVIOUR CONTROLLER + MEMORIA
      // Analizar estado de la conversación y construir memoria
      // ============================================
      const conversationState = behaviourController.analyzeConversationState(conversationHistory);

      // NUEVO: Construir memoria conversacional inteligente
      const memory = memoryService.buildConversationalMemory(conversationHistory);
      const conversionScore = memoryService.calculateConversionScore(memory);
      const enrichedContext = memoryService.generateEnrichedContext(memory, conversationState);

      // Instrucciones dinámicas simples (backup si falla memoria)
      const dynamicInstructions = behaviourController.generateDynamicInstructions(conversationState);

      logger.info('🧠 Estado de conversación analizado', {
        phase: conversationState.phase,
        hasName: conversationState.hasName,
        platform: conversationState.platform,
        memoryName: memory.name,
        painPoints: memory.painPoints.length,
        frustrationLevel: memory.frustrationLevel,
        conversionScore: conversionScore,
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
        sentiment,
        conversationState // NUEVO: Pasar estado para reglas dinámicas
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

      // Agregar MEMORIA CONVERSACIONAL ENRIQUECIDA (prioridad alta)
      messages.push({
        role: 'system',
        content: `${enrichedContext}

⚠️ REGLAS BÁSICAS:
- ${context.rules.maxLength}
- ${context.rules.maxQuestions}
- ${context.rules.maxLines}
- Estilo: ${context.rules.style}

${context.sentimentInstructions}`,
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
            model: 'gpt-4o', // Modelo más inteligente y conversacional
            messages: messages,
            temperature: 0.9, // MÁS creativo y natural (agente vs bot)
            max_tokens: 200, // Más espacio para respuestas sustanciales
            top_p: 0.95, // Sampling más enfocado (mejor calidad)
            frequency_penalty: 0.5, // Evita repeticiones, más variedad
            presence_penalty: 0.6, // Fomenta nuevos temas, más conversacional
          });

          let responseText = completion.choices[0].message.content.trim();

          // ============================================
          // VALIDAR RESPUESTA (CAPA 2)
          // ============================================
          const validation = orchestrationService.validateResponse(responseText, conversationState);

          if (!validation.valid) {
            logger.warn('⚠️ Respuesta no válida', {
              errors: validation.errors,
              rulesUsed: validation.rulesUsed,
              phase: conversationState.phase,
            });

            // Si hay errores y quedan reintentos, pedir nueva respuesta
            if (attempt < maxRetries) {
              const maxChars = context.isFlexPhase ? 500 : 400;
              const maxLines = context.isFlexPhase ? 6 : 5;
              const maxQuestions = 2;

              messages.push({
                role: 'system',
                content: `CORRECCIÓN NECESARIA:
Tu respuesta fue rechazada por: ${validation.errors.join(', ')}

Genera UNA NUEVA respuesta que cumpla las reglas:
- Máximo ${maxChars} caracteres
- Máximo ${maxLines} líneas
- Máximo ${maxQuestions} preguntas
- Natural, conversacional, humana`,
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
   * 🧠 NUEVO: Genera respuesta CON THINKING ENGINE
   * El agente PIENSA antes de responder usando Chain-of-Thought
   *
   * @param {string} userMessage - Último mensaje del usuario
   * @param {Array} conversationHistory - Historial
   * @param {Object} thinkingAnalysis - Análisis del Thinking Engine
   * @param {Object} leadScore - Calificación del lead
   */
  async generateResponseWithThinking(userMessage, conversationHistory, thinkingAnalysis, leadScore) {
    try {
      logger.info('🧠 Generando respuesta con Thinking Engine', {
        shopifyDetected: thinkingAnalysis.shopify.detected,
        painLevel: thinkingAnalysis.pain.level,
        recommendation: thinkingAnalysis.recommendation.action,
      });

      // Si debe descalificar, retornar mensaje directamente
      if (thinkingAnalysis.shopify.shouldDisqualify) {
        const platform = thinkingAnalysis.shopify.reason.includes('WooCommerce') ? 'WooCommerce' :
                         thinkingAnalysis.shopify.reason.includes('Magento') ? 'Magento' :
                         thinkingAnalysis.shopify.reason.includes('VTEX') ? 'VTEX' : 'otra plataforma';

        return `Datapify funciona solo con Shopify. Si algún día migras a Shopify, conversamos :)`;
      }

      // ============================================
      // CONSTRUIR CONTEXTO DE PENSAMIENTO
      // ============================================
      const thinkingContext = this.buildThinkingContext(thinkingAnalysis, conversationHistory);

      // ============================================
      // CHAIN-OF-THOUGHT PROMPT
      // El agente RAZONA antes de responder
      // ============================================
      const chainOfThoughtPrompt = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 ANÁLISIS DEL MENSAJE (Piensa antes de responder)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${thinkingContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💭 AHORA RESPONDE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Basado en el análisis, responde de forma natural, estratégica y humana.

IMPORTANTE:
- Máximo 2-3 líneas
- 1 pregunta como máximo
- Tono chileno casual
- Reconoce lo que el usuario acaba de decir
- Avanza la conversación estratégicamente`;

      // ============================================
      // CONSTRUIR MENSAJES PARA EL LLM
      // ============================================
      const messages = [
        {
          role: 'system',
          content: this.systemPrompt,
        },
        {
          role: 'system',
          content: chainOfThoughtPrompt,
        },
      ];

      // Agregar historial (últimos 6 mensajes)
      const recentHistory = conversationHistory.slice(-6);
      recentHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'usuario' || msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      });

      // Agregar mensaje actual
      messages.push({
        role: 'user',
        content: userMessage,
      });

      // ============================================
      // LLAMAR AL LLM CON PARÁMETROS OPTIMIZADOS
      // ============================================
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,  // 🎯 AJUSTADO: Más consistente (antes: 0.9)
        max_tokens: 350,   // 🎯 AJUSTADO: Más espacio para pensar (antes: 200)
        top_p: 0.95,
        frequency_penalty: 0.5,
        presence_penalty: 0.6,
      });

      let responseText = completion.choices[0].message.content.trim();

      // Formatear para WhatsApp
      const orchestrationService = require('./orchestrationService');
      responseText = orchestrationService.formatForWhatsApp(responseText);

      logger.info('✅ Respuesta generada con Thinking Engine', {
        length: responseText.length,
        tokensUsed: completion.usage.total_tokens,
        shopifyAcknowledged: thinkingAnalysis.shopify.detected ? responseText.toLowerCase().includes('shopify') : 'n/a',
      });

      return responseText;

    } catch (error) {
      logger.error('Error generando respuesta con Thinking Engine:', error);

      // Fallback a método tradicional
      logger.warn('⚠️ Fallback a generateResponse tradicional');
      return this.generateResponse(userMessage, conversationHistory, leadScore);
    }
  }

  /**
   * 🧠 CONSTRUYE CONTEXTO DE PENSAMIENTO
   * Genera el prompt interno para que el agente "piense"
   */
  buildThinkingContext(analysis, history) {
    let context = '';

    // 1. ¿Qué detecté en el último mensaje?
    context += '📝 LO QUE ACABO DE DETECTAR:\n';

    if (analysis.shopify.detected) {
      context += `✅ Usuario CONFIRMÓ SHOPIFY (confianza: ${(analysis.shopify.confidence * 100).toFixed(0)}%)\n`;
      context += `   Método: ${analysis.shopify.method}\n`;
      context += `   → IMPORTANTE: Reconoce esto en tu respuesta\n`;
    } else if (analysis.shopify.shouldDisqualify) {
      context += `❌ Usuario NO usa Shopify (${analysis.shopify.reason})\n`;
    } else {
      context += `⚠️ No confirmó Shopify todavía\n`;
    }

    if (analysis.pain.level !== 'none') {
      context += `🔥 DOLOR DETECTADO: Nivel ${analysis.pain.level}\n`;
      context += `   Señales: ${analysis.pain.signals.join(', ')}\n`;
      context += `   → Empatiza con su problema\n`;
    }

    context += `🎯 Intención: ${analysis.intent.primary}\n`;
    context += '\n';

    // 2. ¿Qué sé del usuario?
    context += '👤 LO QUE SÉ DEL USUARIO:\n';
    if (analysis.leadInfo.name) context += `- Nombre: ${analysis.leadInfo.name}\n`;
    if (analysis.leadInfo.business) context += `- Negocio: ${analysis.leadInfo.business}\n`;
    if (analysis.leadInfo.investsInAds) context += `- Invierte en publicidad\n`;

    context += `- Mensajes intercambiados: ${analysis.context.messageCount}\n`;
    context += `- Engagement: ${analysis.context.engagementLevel}\n`;
    context += `- Fase: ${analysis.context.phase}\n`;
    context += '\n';

    // 3. ¿Qué preguntas ya hice?
    const asked = analysis.context.questionsAsked;
    context += '❓ PREGUNTAS YA HECHAS:\n';
    if (asked.name) context += '- ✅ Nombre\n';
    if (asked.platform) context += '- ✅ Plataforma\n';
    if (asked.business) context += '- ✅ Tipo de negocio\n';
    if (asked.pain) context += '- ✅ Dolor/problema\n';
    if (asked.meeting) context += '- ✅ Reunión propuesta\n';
    context += '\n';

    // 4. ¿Qué debería hacer ahora?
    context += '🎯 RECOMENDACIÓN ESTRATÉGICA:\n';
    context += `Acción: ${analysis.recommendation.action}\n`;
    context += `Prioridad: ${analysis.recommendation.priority}\n`;
    context += `Razón: ${analysis.recommendation.reasoning}\n`;

    if (analysis.recommendation.nextQuestion) {
      context += `Sugerencia: "${analysis.recommendation.nextQuestion}"\n`;
    }

    return context;
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

  /**
   * FASE 2: Genera un resumen conciso de la conversación para memoria persistente
   * Máximo 150 tokens para mantener costos bajos
   */
  async generateConversationSummary(messages, leadData) {
    try {
      // Formatear mensajes para el resumen
      const conversationText = messages
        .map(msg => `${msg.role === 'user' ? 'Cliente' : 'Vendedor'}: ${msg.content}`)
        .join('\n');

      const prompt = `Resume esta conversación de ventas en máximo 2-3 frases cortas. Enfócate en:
1. ¿Qué busca/necesita el cliente?
2. Información clave del negocio (plataforma, ingresos, problemas)
3. Estado de la conversación (interesado/descalificado/agendó)

Cliente: ${leadData?.name || 'Sin nombre'}
Negocio: ${leadData?.businessType || 'No especificado'}

Conversación:
${conversationText}

Resumen (máximo 50 palabras):`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Modelo más económico
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 150,
      });

      const summary = completion.choices[0].message.content.trim();
      logger.info('📝 Resumen de conversación generado', {
        messageCount: messages.length,
        summaryLength: summary.length,
      });

      return summary;
    } catch (error) {
      logger.error('Error generando resumen de conversación:', error);
      // Fallback: resumen básico sin IA
      return `Cliente ${leadData?.name || 'anónimo'} - ${messages.length} mensajes intercambiados`;
    }
  }
}

module.exports = new OpenAIService();
