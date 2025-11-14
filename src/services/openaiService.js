const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    // Cargar conocimiento del negocio
    this.businessKnowledge = this.loadBusinessKnowledge();

    // System prompt optimizado
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
   * Construye el system prompt optimizado
   */
  buildSystemPrompt() {
    const bk = this.businessKnowledge;
    if (!bk) {
      return 'Eres un asistente de ventas profesional.';
    }

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

FASES DE CONVERSACIÓN:
1. CALIFICACIÓN: "¿Tu sitio está en Shopify?" → NO=descalificar, SÍ=fase 2
2. DOLOR (2-4 msg): Detecta dolor específico, cuantifica, pregunta meta
3. DIAGNÓSTICO (2-3 msg): Muestra GAP. Guía a que identifiquen: publicidad=problema
4. SOLUCIÓN: AHORA menciona Datapify
5. PROOF: Caso de éxito similar
6. CTA: "¿Agendamos 30 min?"

CRÍTICO:
- 1ra pregunta SIEMPRE: "¿Tu sitio está en Shopify?"
- NO Shopify → descalificar
- <$3M/mes → "Vuelve cuando vendas más"
- NO mencionar Datapify hasta identificar dolor
- Termina SIEMPRE con 1 pregunta (max 15 palabras)
- 2-3 líneas máx`;
  }

  /**
   * Genera una respuesta usando OpenAI
   */
  async generateResponse(userMessage, conversationHistory = [], leadScore = null) {
    try {
      // Construir mensajes para OpenAI
      const messages = [
        {
          role: 'system',
          content: this.systemPrompt,
        },
      ];

      // Agregar contexto del lead si existe
      if (leadScore) {
        messages.push({
          role: 'system',
          content: `LEAD ACTUAL: ${leadScore.temperature} (${leadScore.score}/10) | Fase: ${leadScore.phase}`,
        });
      }

      // Agregar historial (últimos 5 mensajes)
      conversationHistory.slice(-5).forEach(msg => {
        messages.push({
          role: msg.role === 'usuario' ? 'user' : 'assistant',
          content: msg.content,
        });
      });

      // Agregar mensaje actual del usuario
      messages.push({
        role: 'user',
        content: userMessage,
      });

      // Llamar a OpenAI con retry logic
      const maxRetries = 3;
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini', // Modelo más económico y rápido
            messages: messages,
            temperature: 0.7,
            max_tokens: 300, // Suficiente para 2-3 líneas en WhatsApp
            top_p: 0.95,
            frequency_penalty: 0.3, // Evita repeticiones
            presence_penalty: 0.3,  // Fomenta variedad
          });

          const responseText = completion.choices[0].message.content;

          if (attempt > 1) {
            logger.info(`✅ OpenAI exitoso en intento ${attempt}`);
          }

          logger.info('✅ Respuesta generada por OpenAI', {
            inputLength: userMessage.length,
            outputLength: responseText.length,
            model: completion.model,
            tokensUsed: completion.usage.total_tokens,
            leadTemp: leadScore?.temperature || 'unknown',
            attempt,
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
            const baseWait = attempt * 1000;
            const jitter = Math.random() * 500;
            const waitTime = baseWait + jitter;

            logger.warn(`⚠️ OpenAI error (${error.status || error.code}). Retry ${attempt + 1}/${maxRetries} en ${Math.round(waitTime)}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          throw error;
        }
      }

      throw lastError;
    } catch (error) {
      logger.error('Error generando respuesta con OpenAI:', {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type,
      });
      throw error;
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
