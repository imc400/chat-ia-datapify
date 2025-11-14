const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.gemini.model });

    // Cargar conocimiento del negocio
    this.businessKnowledge = this.loadBusinessKnowledge();

    // Prompt conversacional avanzado
    this.systemPrompt = this.buildAdvancedPrompt();
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
   * Construye un prompt OPTIMIZADO (60% más corto para reducir latencia y 503s)
   */
  buildAdvancedPrompt() {
    const bk = this.businessKnowledge;
    if (!bk) {
      return 'Eres un asistente de ventas profesional.';
    }

    // PROMPT COMPRIMIDO - Solo lo esencial
    return `Eres ${bk.company.name}: ${bk.company.description}
Tono: ${bk.company.tone}

METODOLOGÍA: ${bk.conversation_guidelines.methodology}
${bk.conversation_guidelines.philosophy}

REGLA DE ORO: NO vendas directo. Haz preguntas para que el cliente DESCUBRA que su problema es la publicidad.

OFRECES (solo tras identificar dolor): ${bk.value_proposition.one_liner}
Planes: ${bk.plans.map(p => `${p.name} ${p.price} (${p.trial})`).join(' | ')}
Diferenciadores: ${bk.value_proposition.key_differentiators.slice(0, 3).join(', ')}

CLIENTE IDEAL: ${bk.target_audience.ideal_clients[0]}
MUST-HAVE: ${bk.target_audience.qualification_criteria.must_have.slice(0, 2).join('; ')}
DESCALIFICADORES: ${bk.target_audience.qualification_criteria.disqualifiers.slice(0, 2).join('; ')}

PREGUNTAS CLAVE:
1. ${bk.lead_qualification.qualifying_questions[0]}
2. ${bk.lead_qualification.qualifying_questions[1]}
3. ${bk.lead_qualification.qualifying_questions[2]}

✅ SÍ: ${bk.conversation_guidelines.do.slice(0, 4).join('; ')}
❌ NO: ${bk.conversation_guidelines.dont.slice(0, 4).join('; ')}

INVITAR A AGENDAR cuando: ${bk.meeting_invitation_triggers.when_to_invite.slice(0, 3).join('; ')}
Frase: ${bk.meeting_invitation_triggers.invitation_phrases[0]}

FORMATO:
- Max 2-3 líneas
- 1 pregunta
- Lenguaje chileno: "demás", "te tinca", "palos"
- 1 emoji máx
- Validación: "Uff entiendo", "Sii te cacho"

HORARIO: ${bk.business_hours.work_days}, ${bk.business_hours.hours}

CRÍTICO:
- 1ra pregunta SIEMPRE: "¿Tu sitio está en Shopify?"
- NO Shopify → descalificar
- <$3M/mes → "Vuelve cuando vendas más"
- NO mencionar Datapify hasta identificar dolor`;
  }

  /**
   * Genera una respuesta basada en el mensaje del usuario
   */
  async generateResponse(userMessage, conversationHistory = [], leadScore = null) {
    try {
      // Construir prompt OPTIMIZADO (60% más corto)
      let prompt = this.systemPrompt + '\n\n';

      // Contexto del lead (comprimido)
      if (leadScore) {
        prompt += `LEAD: ${leadScore.temperature} (${leadScore.score}/10) | Fase: ${leadScore.phase}\n\n`;
      }

      // Historial: SOLO últimos 5 mensajes (reducido de 10)
      if (conversationHistory.length > 0) {
        prompt += 'HISTORIAL:\n';
        conversationHistory.slice(-5).forEach(msg => {
          const role = msg.role === 'usuario' ? 'Cliente' : 'Tú';
          prompt += `${role}: ${msg.content}\n`;
        });
        prompt += '\n';
      }

      prompt += `MENSAJE: ${userMessage}\n\n`;

      // Instrucciones COMPRIMIDAS (de 80 líneas a 25)
      prompt += `FASES:
1. CALIFICACIÓN: "¿Tu sitio está en Shopify?" → NO=descalificar, SÍ=fase 2
2. DOLOR (2-4 msg): Detecta dolor específico, cuantifica, pregunta meta. Ej: "¿Cuánto vendes?" → "¿Cuánto quisieras?"
3. DIAGNÓSTICO (2-3 msg): Muestra GAP. Guía a que identifiquen: publicidad=problema
4. SOLUCIÓN: AHORA menciona Datapify. "Te cacho. Por eso creamos Datapify, optimiza con IA sin agencia. ¿Te tinca?"
5. PROOF: Caso de éxito similar
6. CTA: "¿Agendamos 30 min para que veas la plataforma?"

CRÍTICO:
- NO mencionar Datapify hasta fase 4
- Termina SIEMPRE con 1 pregunta (max 15 palabras)
- 2-3 líneas máx
- Empático: "Uff entiendo", "Sii te cacho"
- Lenguaje chileno

TU RESPUESTA:`;

      // Retry con exponential backoff + jitter aleatorio
      const maxRetries = 3;
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Timeout de 30 segundos
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: Gemini tardó más de 30s')), 30000)
          );

          const generatePromise = this.model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,        // Reducido de 0.8 (más consistente)
              maxOutputTokens: 512,    // Reducido de 2048 (suficiente para WhatsApp)
              topP: 0.95,
              topK: 40,
            },
          });

          const result = await Promise.race([generatePromise, timeoutPromise]);
          const response = result.response;
          const responseText = response.text();

          if (attempt > 1) {
            logger.info(`✅ Intento ${attempt} exitoso después de error`);
          }

          logger.info('✅ Respuesta generada por Gemini', {
            inputLength: userMessage.length,
            outputLength: responseText.length,
            promptTokens: Math.ceil(prompt.length / 4), // Estimación
            leadTemp: leadScore?.temperature || 'unknown',
            attempt,
          });

          return responseText;
        } catch (error) {
          lastError = error;

          // Reintentar en 503, 429 (rate limit), timeout
          const isRetryable = error.message?.includes('503') ||
                              error.message?.includes('overloaded') ||
                              error.message?.includes('429') ||
                              error.message?.includes('Timeout');

          if (isRetryable && attempt < maxRetries) {
            // Exponential backoff con jitter aleatorio (reduce colisiones)
            const baseWait = attempt * 1000; // 1s, 2s, 3s
            const jitter = Math.random() * 500; // 0-500ms aleatorio
            const waitTime = baseWait + jitter;

            logger.warn(`⚠️ Error ${error.message?.substring(0, 50)}. Retry ${attempt + 1}/${maxRetries} en ${Math.round(waitTime)}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          // Si no es retryable o ya agotamos reintentos
          throw error;
        }
      }

      // Si llegamos aquí, agotamos los reintentos
      throw lastError;
    } catch (error) {
      logger.error('Error generando respuesta con Gemini:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Califica un lead basado en la conversación
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
    score = Math.max(0, Math.min(10, score)); // Entre 0 y 10

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

    // Mapeo de señales específicas de Datapify
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
   * Analiza si el mensaje contiene intención de agendar
   */
  parseScheduleIntent(aiResponse) {
    const intentRegex = /\[INTENT:SCHEDULE\]([\s\S]*?)\[\/INTENT\]/;
    const match = aiResponse.match(intentRegex);

    if (!match) {
      return null;
    }

    const intentData = match[1];

    const extractValue = (field) => {
      const regex = new RegExp(`\\[${field}:([^\\]]+)\\]`);
      const match = intentData.match(regex);
      return match ? match[1].trim() : null;
    };

    const scheduleIntent = {
      name: extractValue('NAME'),
      reason: extractValue('REASON'),
      date: extractValue('DATE'),
      time: extractValue('TIME'),
    };

    // Validar que tengamos todos los datos necesarios
    const isComplete = Object.values(scheduleIntent).every(val => val !== null);

    logger.info('🎯 Intención de agendamiento detectada', {
      scheduleIntent,
      isComplete,
    });

    return {
      ...scheduleIntent,
      isComplete,
    };
  }

  /**
   * Limpia la respuesta eliminando las etiquetas de intención
   */
  cleanResponse(aiResponse) {
    return aiResponse.replace(/\[INTENT:SCHEDULE\][\s\S]*?\[\/INTENT\]/g, '').trim();
  }

  /**
   * Genera un resumen de la reunión agendada
   */
  async generateMeetingSummary(meetingData) {
    try {
      const prompt = `Genera un mensaje de confirmación breve y profesional para una reunión agendada con estos datos:
- Nombre: ${meetingData.name}
- Motivo: ${meetingData.reason}
- Fecha: ${meetingData.date}
- Hora: ${meetingData.time}

Incluye un mensaje de bienvenida y confirma los detalles. Máximo 3 líneas.`;

      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      return response;
    } catch (error) {
      logger.error('Error generando resumen de reunión:', error);
      return `✅ Reunión agendada con éxito para ${meetingData.date} a las ${meetingData.time}. Te esperamos, ${meetingData.name}.`;
    }
  }
}

module.exports = new GeminiService();
