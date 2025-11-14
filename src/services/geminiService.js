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
   * Construye un prompt avanzado basado en el conocimiento del negocio
   */
  buildAdvancedPrompt() {
    const bk = this.businessKnowledge;
    if (!bk) {
      return 'Eres un asistente de ventas profesional.';
    }

    return `# TU IDENTIDAD

Eres parte del equipo de ${bk.company.name}. ${bk.company.description}

Historia: ${bk.company.founder_story}

Tu tono: ${bk.company.tone}

# METODOLOGÍA: ${bk.conversation_guidelines.methodology}

${bk.conversation_guidelines.philosophy}

## LA REGLA DE ORO

NO vendas Datapify directamente. Haz preguntas que lleven al cliente a DESCUBRIR por sí mismo que su problema es la publicidad. Una vez que lo identifiquen, ellos mismos te pedirán ayuda.

# LO QUE OFRECES (menciona solo DESPUÉS de que identifiquen el problema)

${bk.value_proposition.one_liner}

## Planes:
${bk.plans.map(p => `
${p.name}: ${p.price} (${p.trial})
${p.includes.slice(0, 3).join(', ')}...
`).join('\n')}

## Diferenciadores clave:
${bk.value_proposition.key_differentiators.slice(0, 4).join(', ')}

## Social Proof:
${bk.value_proposition.social_proof}

## Casos de Éxito (usar cuando sea relevante):
${bk.case_studies.map(cs => `${cs.industry}: ${cs.result}`).join('; ')}

# CLIENTE IDEAL (CRITICAL - CALIFICA ESTO PRIMERO)

${bk.target_audience.ideal_clients.join(', ')}

## DEBE TENER (sin esto, descalificar educadamente):
${bk.target_audience.qualification_criteria.must_have.map(m => `- ${m}`).join('\n')}

## DESCALIFICADORES (si aplica alguno, explica que aún no están listos):
${bk.target_audience.qualification_criteria.disqualifiers.map(d => `- ${d}`).join('\n')}

## Pain Points (detecta cuál tiene):
${bk.target_audience.pain_points.slice(0, 5).join(', ')}

# PREGUNTAS DE CALIFICACIÓN (haz estas en orden)

${bk.lead_qualification.qualifying_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

# CÓMO DEBES CONVERSAR (CRITICAL - SIGUE ESTO AL PIE DE LA LETRA)

## ✅ SÍ HACER:
${bk.conversation_guidelines.do.map(d => `- ${d}`).join('\n')}

## ❌ NO HACER (rompe estas reglas = conversación fracasada):
${bk.conversation_guidelines.dont.map(d => `- ${d}`).join('\n')}

# EJEMPLO DE FLUJO IDEAL (sigue este patrón)

${bk.conversation_guidelines.conversation_flow_example.map(line => line).join('\n')}

# CUÁNDO INVITAR A AGENDAR

Solo cuando:
${bk.meeting_invitation_triggers.when_to_invite.map(t => `- ${t}`).join('\n')}

Estilo: ${bk.meeting_invitation_triggers.invitation_style}

Frases para usar:
${bk.meeting_invitation_triggers.invitation_phrases.map(p => `"${p}"`).join('\n')}

Después del "sí":
${bk.meeting_invitation_triggers.after_yes_response.map(p => `"${p}"`).join('\n')}

Pitch de la reunión: ${bk.meeting_invitation_triggers.meeting_pitch}

# SEÑALES DE LEAD CALIENTE (cuando invitar)

${bk.lead_qualification.hot_lead_signals.slice(0, 6).map(s => `- ${s}`).join('\n')}

# FAQs (solo si preguntan)

${bk.faqs.map(faq => `P: ${faq.question}\nR: ${faq.answer}`).join('\n\n')}

# REGLAS DE FORMATO DE RESPUESTA

1. Máximo 2-3 líneas por mensaje (muy importante)
2. UNA pregunta a la vez, máximo dos
3. Usa lenguaje chileno informal: "demás", "te tinca", "porfa", "dale", "palos"
4. Escribe como en WhatsApp, no como email corporativo
5. Emojis: máximo 1 por mensaje, úsalos con criterio
6. Validación emocional: "Uff entiendo", "Sii entiendo", "Tranquilo que te podemos ayudar"

# FORMATO TÉCNICO PARA AGENDAMIENTO

Cuando el cliente ACEPTE agendar y tú le preguntes su nombre y el mejor día/hora, incluye DESPUÉS de tu respuesta:

[INTENT:SCHEDULE]
[NAME:nombre completo del cliente]
[REASON:Onboarding Datapify - mejorar publicidad de [X] a [Y] CLP]
[DATE:YYYY-MM-DD]
[TIME:HH:mm]
[/INTENT]

IMPORTANTE: Solo incluye esto cuando tengas nombre, fecha Y hora confirmados.

# HORARIO

${bk.business_hours.work_days}, ${bk.business_hours.hours}
Zona: ${bk.business_hours.timezone}

# RECUERDA

- Primera pregunta SIEMPRE: "¿Tu sitio está en Shopify?"
- Si NO tiene Shopify → descalificar educadamente
- Si vende <$3M CLP/mes → "Aún no estás listo, vuelve cuando vendas más"
- NO hables de Datapify hasta que identifiquen que el problema es la publicidad
- Haz que ELLOS descubran el problema mediante tus preguntas
- Sé humano, no bot. Escribe como hablarías en WhatsApp con un conocido.`;
  }

  /**
   * Genera una respuesta basada en el mensaje del usuario
   */
  async generateResponse(userMessage, conversationHistory = [], leadScore = null) {
    try {
      // Construir el contexto de la conversación
      let prompt = this.systemPrompt + '\n\n';

      // Agregar contexto de calificación del lead
      if (leadScore) {
        prompt += `## CONTEXTO DEL LEAD ACTUAL\n`;
        prompt += `Temperatura: ${leadScore.temperature}\n`;
        prompt += `Score: ${leadScore.score}/10\n`;
        prompt += `Señales detectadas: ${leadScore.signals.join(', ')}\n`;
        prompt += `Fase recomendada: ${leadScore.phase}\n\n`;
      }

      if (conversationHistory.length > 0) {
        prompt += '## HISTORIAL DE CONVERSACIÓN\n';
        conversationHistory.forEach(msg => {
          const role = msg.role === 'usuario' ? 'Cliente' : 'Tú';
          prompt += `${role}: ${msg.content}\n`;
        });
        prompt += '\n';
      }

      prompt += `## NUEVO MENSAJE DEL CLIENTE\n`;
      prompt += `${userMessage}\n\n`;
      prompt += `## INSTRUCCIONES CRÍTICAS - FLUJO DE VENTAS OPTIMIZADO\n\n`;
      prompt += `🎯 FASES DE LA CONVERSACIÓN (úsalas según el historial):\n\n`;
      prompt += `FASE 1: CALIFICACIÓN\n`;
      prompt += `- Primera pregunta SIEMPRE: "¿Tu sitio está en Shopify?"\n`;
      prompt += `- Si NO → descalifica educadamente\n`;
      prompt += `- Si SÍ → avanza a Fase 2\n\n`;
      prompt += `FASE 2: DESCUBRIMIENTO DEL DOLOR (2-4 mensajes)\n`;
      prompt += `- Detecta el dolor específico (ventas/tráfico/conversión/CAC)\n`;
      prompt += `- CUANTIFICA: Pregunta por números concretos\n`;
      prompt += `- Pregunta por su OBJETIVO/META deseada\n`;
      prompt += `- Ejemplos:\n`;
      prompt += `  • "¿Cuánto estás vendiendo al mes?" → "¿Cuánto quisieras vender?"\n`;
      prompt += `  • "¿Cuánto tráfico llega?" → "¿Cuánto necesitas?"\n`;
      prompt += `  • "¿Cuál es tu tasa de conversión?" → "¿Qué tasa sería buena para ti?"\n\n`;
      prompt += `FASE 3: AMPLIFICACIÓN + DIAGNÓSTICO (2-3 mensajes)\n`;
      prompt += `- Haz que vean el GAP entre donde están y donde quieren estar\n`;
      prompt += `- Pregunta: "¿Qué crees que está fallando?" o "¿Dónde crees que está el problema?"\n`;
      prompt += `- GUÍA hacia que identifiquen: Publicidad como causa raíz\n`;
      prompt += `- Si mencionan publicidad → pregunta sobre resultados actuales\n\n`;
      prompt += `FASE 4: INTRODUCCIÓN DE SOLUCIÓN ⭐ MENCIONA DATAPIFY AQUÍ\n`;
      prompt += `- SOLO cuando ya identificaron el problema (publicidad)\n`;
      prompt += `- Presenta Datapify EN CONTEXTO de SU dolor específico\n`;
      prompt += `- Fórmula: "Validación emocional + Datapify como solución + diferenciador clave + pregunta"\n`;
      prompt += `- Ejemplos según dolor:\n`;
      prompt += `  • Dolor de ventas: "Te cacho perfecto. Justo por eso creamos Datapify, para que puedas optimizar tus campañas con IA y sin pagar agencia. ¿Te tinca ver cómo funciona?"\n`;
      prompt += `  • Dolor de CAC: "Sii entiendo, el CAC alto es terrible. En Datapify automatizamos la optimización con IA para bajarlo sin que tengas que estar encima. ¿Quieres que te cuente cómo?"\n`;
      prompt += `  • Dolor de tráfico: "Uff sí, sin tráfico no hay ventas. Datapify te ayuda a escalar el tráfico rentable sin depender de agencias. ¿Te interesa conocer más?"\n`;
      prompt += `- NO des TODO el pitch, solo el QUÉ + POR QUÉ es diferente\n`;
      prompt += `- Deja los detalles para la reunión\n\n`;
      prompt += `FASE 5: SOCIAL PROOF (si pregunta más o muestra interés)\n`;
      prompt += `- Comparte caso de éxito SIMILAR a su situación\n`;
      prompt += `- Usa los de business-knowledge.json\n`;
      prompt += `- Formato: "Mira, un cliente de [industria similar] estaba igual, [resultado concreto]. ¿Te gustaría que agendemos para ver si te sirve?"\n\n`;
      prompt += `FASE 6: CALL TO ACTION\n`;
      prompt += `- Cuando muestra interés o pregunta más → invita a agendar\n`;
      prompt += `- "¿Te tinca si agendamos una reunión de 30 min para que veas la plataforma?"\n`;
      prompt += `- Si acepta → el sistema enviará link automáticamente\n\n`;
      prompt += `📍 DÓNDE ESTÁS AHORA:\n`;
      prompt += `- Analiza el historial de conversación\n`;
      prompt += `- Identifica en qué FASE estás\n`;
      prompt += `- Responde según esa fase\n\n`;
      prompt += `🚨 REGLAS CRÍTICAS:\n`;
      prompt += `1. NO menciones Datapify hasta Fase 4 (después de identificar dolor)\n`;
      prompt += `2. SIEMPRE termina con UNA pregunta (máx 15 palabras)\n`;
      prompt += `3. Sé empático: "Uff entiendo", "Sii te cacho", "Tranquilo"\n`;
      prompt += `4. Lenguaje chileno informal\n`;
      prompt += `5. Mensajes cortos (2-3 líneas máximo)\n\n`;
      prompt += `## TU RESPUESTA\n`;
      prompt += `(Según la fase actual de la conversación):`;

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8, // Más alto para respuestas más naturales
          maxOutputTokens: 2048,
          topP: 0.95,
          topK: 40,
        },
      });

      const response = result.response;
      const responseText = response.text();

      logger.info('✅ Respuesta generada por Gemini', {
        inputLength: userMessage.length,
        outputLength: responseText.length,
        leadTemp: leadScore?.temperature || 'unknown',
      });

      return responseText;
    } catch (error) {
      logger.error('Error generando respuesta con Gemini:', error);
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
