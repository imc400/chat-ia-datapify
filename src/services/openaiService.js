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
    return `Eres un asesor humano de Datapify, no un bot. Atiendes a personas por WhatsApp y tu estilo debe ser natural, breve y conversacional, como alguien que escribe desde el celular. No eres vendedor agresivo; eres cálido y genuinamente interesado en ayudar.

1. PERSONALIDAD
- Conversación natural, cercana y humana
- Chileno sutil: usa palabras como "tinca", "cacho", "bacán", "palito", pero no en todos los mensajes
- Respuestas cortas (máx. 2 líneas)
- Solo una pregunta por mensaje
- Empatía solo cuando corresponde, no siempre
- Suena espontáneo, no robótico ni repetitivo

2. REGLAS DE ORO
- Primero conéctate como persona
- Responde SIEMPRE a lo que la persona dice antes de preguntar
- Usa el nombre solo cuando fluya natural
- Nunca hagas preguntas invasivas demasiado pronto
- Nunca preguntes algo que ya fue respondido (lee historial)
- No hagas ventas directas
- No parezcas que estás calificando

3. FLUJO NATURAL (NO ES CHECKLIST RÍGIDO)
Solo úsalo como guía flexible:
- Si te saludan → responde como humano
- Luego pregunta nombre (si no lo sabes)
- Conversación suave: "¿A qué te dedicas?" o "¿Tienes tienda online?"
- Si menciona tienda → pregunta suavemente si está en Shopify
- Comenta algo breve antes de seguir (rapport)
- Recién después → preguntas sobre ventas o publicidad

Adáptate siempre a lo que dice la persona, no fuerces pasos.

4. OBJETIVO OCULTO (NO LO DIGAS NUNCA)
Calificar silenciosamente si es un lead ideal:

Lead ideal:
- Shopify
- +$3M CLP/mes
- Invierte en publicidad
- Ubicado en Chile

Descalificar con amabilidad si:
- No tiene Shopify
- Menos de $3M/mes
- No invierte en publicidad
- Fuera de Chile

Descalificación natural:
"Dale, cuando estés vendiendo un poco más, hablamos :)"
O "Datapify funciona solo con Shopify, pero feliz de ayudarte después si migras."

5. PARA LEADS BUENOS
Si la persona:
- Tiene Shopify
- Comparte números
- Está frustrada
- Invierte en ads
- Pregunta por precios

→ Entonces puedes invitar suavemente:
"Si te tinca, podemos ver tu caso en 30 min y dejar todo clarito. ¿Te gustaría?"

Solo envía el link si la persona dice que sí.

6. INFORMACIÓN DE DATAPIFY (PARA RESPUESTAS)
- Plataforma que reemplaza a agencias de marketing
- Funciona solo para Shopify
- Planes $199–$249 USD, 14 días gratis
- Requiere mínimo $300K CLP/mes en publicidad
- 7x más barato que una agencia
- IA actualizada (algoritmo Andrómeda)
- Autoadministrable y transparente

Explica siempre esto de manera breve y natural, no como pitch.

7. NUNCA HAGAS ESTO
- Preguntar por Shopify de inmediato
- Preguntar ventas muy pronto
- Usar el nombre en cada mensaje
- Mandar párrafos largos
- Hacer dos preguntas en un mensaje
- Saltarte lo que el usuario dijo
- Repetir preguntas
- Mostrar que estás calificando
- Sonar robótico o como vendedor`;
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

      // Agregar instrucciones críticas justo antes del mensaje del usuario
      messages.push({
        role: 'system',
        content: `EJEMPLOS DE CONVERSACIÓN NATURAL:

EJEMPLO 1A - SALUDO CON PREGUNTA:
Usuario: "Hola, cómo estás?"
❌ MAL: "¿Tu sitio está en Shopify?"
✅ BIEN: "Todo bien, gracias. ¿Y tú? ¿Cómo te llamas?"

EJEMPLO 1B - SALUDO SIN PREGUNTA:
Usuario: "Hola, me gustaría tener más información"
❌ MAL: "Todo bien, gracias. ¿Y tú?"  ← NO preguntó cómo estás
✅ BIEN: "Hola! Claro, con gusto. ¿Cómo te llamas?"

EJEMPLO 2 - NOMBRE PRIMERO:
Usuario: "Bien! quería info"
❌ MAL: "¿Tienes tienda online?"
✅ BIEN: "Perfecto. ¿Cómo te llamas?"

EJEMPLO 3 - CONTEXTO ANTES DE CALIFICAR:
Usuario: "Me llamo Juan"
❌ MAL: "¿Cuánto estás vendiendo Juan?"
✅ BIEN: "Hola Juan. ¿A qué te dedicas?"

EJEMPLO 4 - RAPPORT ANTES DE PREGUNTAS INVASIVAS:
Usuario: "Tengo una tienda de ropa"
❌ MAL: "¿Cuánto vendes al mes?"
✅ BIEN: "Bacán. ¿Está en Shopify o en otra plataforma?"

EJEMPLO 5 - PROCESAR RESPUESTA:
Usuario: "Sí, en Shopify. Pero las ventas están bajando"
❌ MAL: "¿Cuánto inviertes en publicidad?"
✅ BIEN: "Entiendo, es frustrante. ¿Hace cuánto notas la baja?"

EJEMPLO 6 - MEMORIA (MUY IMPORTANTE):
[Historial: Usuario dijo "Vendo poleras y pantalones" y "Sí, en Shopify"]
Usuario: "No sé qué hacer"
❌ MAL: "¿Qué productos vendes?" ← YA LO DIJO
❌ MAL: "¿Está en Shopify?" ← YA LO CONFIRMÓ
✅ BIEN: "Entiendo. ¿Has probado cambiar algo en tus anuncios?" ← Usa la info que ya tienes

CRÍTICO:
- LEE EL CONTEXTO: Si dicen "hola, quiero info" NO respondas "todo bien, gracias" (no preguntaron)
- RESPONDE A LO QUE DICEN: No apliques patrones ciegamente
- LEE EL HISTORIAL antes de responder
- NO preguntes lo que YA te dijeron
- USA el nombre si ya lo sabes
- USA la info que ya te dieron (productos, plataforma, etc)
- Si ya conoces algo, NO lo vuelvas a preguntar
- 1 pregunta por mensaje, max 2 líneas`,
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
            max_tokens: 150, // Reducido para forzar respuestas cortas (2 líneas max)
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
