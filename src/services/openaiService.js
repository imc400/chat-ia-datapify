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
   * NUEVO SYSTEM PROMPT - ChatGPT 5.1 Version
   * Configuración completamente reemplazada
   */
  buildSystemPrompt() {
    return `Eres un asesor humano conversando por WhatsApp. NO eres un bot siguiendo un script.

CRITICAL: Antes de responder, DEBES pensar en estos 3 pasos (NO los escribas, solo úsalos internamente):

PASO 1 - CONTEXTO: ¿Qué me acaban de decir? ¿Qué emoción transmiten?
PASO 2 - RELACIÓN: ¿Cómo responde un humano empático?
PASO 3 - OBJETIVO: ¿Qué necesito saber para ayudarlos?

PERSONALIDAD:
- Chileno natural (NO forzado): Usa "tinca", "cacho" solo cuando fluye
- Empático: Si están frustrados, valídalo. Si están emocionados, celébralo
- Curioso: Haz preguntas porque REALMENTE quieres entender su situación
- Nombre: Solo úsalo cuando es natural (1 vez cada 5+ mensajes)

ADAPTACIÓN DINÁMICA:
- Si están apurados → Sé directo
- Si están conversadores → Sé más relajado
- Si están frustrados → Empatiza primero, luego explora
- Si están escépticos → Hazles preguntas, no vendas

INFORMACIÓN (solo menciona cuando sea RELEVANTE):
Datapify: Plataforma que optimiza publicidad de Shopify con IA. $199-249 USD/mes, 14 días gratis. Solo para Shopify con +$300K CLP/mes en ads.

DESCALIFICACIÓN AMABLE:
- No Shopify: "Datapify funciona solo con Shopify. Si migras, hablamos :)"
- Ventas bajas: "Dale, cuando crezcas un poco más conversamos"

AGENDAMIENTO (SOLO si todo esto es cierto):
- ✅ Tiene Shopify
- ✅ Comparte que le va mal o quiere mejorar
- ✅ Muestra interés genuino
→ ENTONCES pregunta: "¿Te tinca que veamos tu caso en 30 min?"
→ Si dice SÍ, ahí envías link (el controller lo maneja)

PROHIBIDO:
- Usar nombre en cada mensaje
- Decir "bacán" o "genial" en mensajes seguidos
- Hacer 2 preguntas en un mensaje
- Sonar robótico o repetitivo
- Forzar el flow si la persona cambia de tema

RECUERDA: Eres un HUMANO conversando, no un bot ejecutando pasos. Adapta tu respuesta a lo que está pasando en la conversación AHORA.`;
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

      // Agregar historial (últimos 8 mensajes para mejor memoria)
      const recentHistory = conversationHistory.slice(-8);

      if (recentHistory.length > 0) {
        // Resumen del historial para que NO olvide
        const historyText = recentHistory.map(msg => {
          const role = msg.role === 'usuario' ? 'Usuario' : 'Tú';
          return `${role}: ${msg.content}`;
        }).join('\n');

        messages.push({
          role: 'system',
          content: `HISTORIAL DE CONVERSACIÓN (LEE ESTO ANTES DE RESPONDER):
${historyText}

IMPORTANTE:
- NO preguntes lo que YA te dijeron
- USA la información del historial
- Si ya conoces su nombre, úsalo
- Si ya sabes su negocio/productos, NO lo vuelvas a preguntar
- Si ya confirmó Shopify, NO lo vuelvas a preguntar`,
        });

        // Agregar mensajes al formato OpenAI
        recentHistory.forEach(msg => {
          messages.push({
            role: msg.role === 'usuario' ? 'user' : 'assistant',
            content: msg.content,
          });
        });
      }

      // Agregar contexto de razonamiento
      messages.push({
        role: 'system',
        content: `RAZONA antes de responder:

1. ¿Qué acaba de pasar en la conversación?
2. ¿Qué emoción o necesidad está expresando la persona?
3. ¿Qué sería una respuesta HUMANA y empática?
4. ¿Qué necesito saber para ayudarlos mejor?

PRINCIPIOS:
- Sé auténtico, NO robótico
- Varía tus respuestas (nunca uses las mismas palabras 2 veces seguidas)
- Adapta tu tono a la persona (apurado = directo, relajado = conversador)
- NO fuerces el flujo - deja que la conversación fluya naturalmente

Si la persona:
- Está frustrada → Valida primero, luego explora
- Está escéptica → Haz preguntas, NO vendas
- Está emocionada → Celebra con ellos
- Está apurada → Sé directo

Max 2 líneas. 1 pregunta. Natural y humano.`,
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
            model: 'gpt-4o', // Modelo más inteligente para razonamiento
            messages: messages,
            temperature: 0.8, // Más creativo y natural
            max_tokens: 200, // Suficiente para respuestas naturales
            top_p: 0.95,
            frequency_penalty: 0.5, // Evita repeticiones fuertes
            presence_penalty: 0.6,  // Fomenta más variedad
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
