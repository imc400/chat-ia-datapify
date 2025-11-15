const logger = require('../utils/logger');

/**
 * SERVICIO DE MEMORIA CONVERSACIONAL INTELIGENTE
 *
 * Mantiene un "resumen vivo" de la conversación que:
 * - Extrae información clave de cada mensaje
 * - No olvida datos importantes aunque pasen muchos mensajes
 * - Genera contexto enriquecido para el LLM
 * - Aprende progresivamente del usuario
 */
class MemoryService {
  constructor() {
    // Patrones para extraer información clave
    this.extractionPatterns = {
      name: [
        /me llamo (\w+)/i,
        /soy (\w+)/i,
        /mi nombre es (\w+)/i,
      ],
      platform: [
        /uso (\w+)/i,
        /tengo (\w+)/i,
        /trabajo con (\w+)/i,
      ],
      business: [
        /vendo (\w+)/i,
        /tienda de (\w+)/i,
        /negocio de (\w+)/i,
      ],
      pain: [
        'no vendo', 'ventas bajas', 'no funciona', 'frustrado',
        'gasto mucho', 'pierdo plata', 'ads no funcionan',
        'mal', 'no compran', 'sin resultados'
      ],
      positive: [
        'me va bien', 'vendo harto', 'buenos resultados',
        'funciona bien', 'estoy contento', 'todo bien'
      ]
    };
  }

  /**
   * Construye memoria conversacional desde historial
   * Este es el "resumen vivo" que nunca se pierde
   */
  buildConversationalMemory(history) {
    const memory = {
      // Datos básicos extraídos
      name: null,
      platform: null,
      business: null,

      // Contexto de negocio
      hasOnlineStore: null,
      monthlyRevenue: null,
      investsInAds: null,
      adSpend: null,

      // Estado emocional y señales
      painPoints: [],
      positiveSignals: [],
      frustrationLevel: 'none', // none, low, medium, high

      // Progreso de calificación
      questionsAnswered: [],
      topicsDiscussed: [],
      stageReached: 'initial', // initial, discovered, qualified, proposed

      // Insights de la conversación
      userTone: 'neutral', // formal, casual, frustrated, enthusiastic
      engagementLevel: 'medium', // low, medium, high

      // Tracking temporal
      lastTopicDiscussed: null,
      conversationFlow: [],
    };

    // Extraer toda la info del historial
    const allText = history.map(h => h.content).join(' ').toLowerCase();
    const userMessages = history.filter(h => h.role === 'user' || h.role === 'usuario');

    // Extraer nombre
    for (const pattern of this.extractionPatterns.name) {
      const match = allText.match(pattern);
      if (match) {
        memory.name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        memory.questionsAnswered.push('nombre');
        break;
      }
    }

    // Extraer plataforma
    if (allText.includes('shopify')) {
      memory.platform = 'Shopify';
      memory.questionsAnswered.push('plataforma');
      memory.stageReached = 'discovered';
    } else if (allText.includes('woocommerce') || allText.includes('magento') ||
               allText.includes('prestashop') || allText.includes('vtex')) {
      memory.platform = 'Otra (no Shopify)';
    }

    // Extraer tipo de negocio
    for (const pattern of this.extractionPatterns.business) {
      const match = allText.match(pattern);
      if (match) {
        memory.business = match[1];
        memory.questionsAnswered.push('negocio');
        break;
      }
    }

    // Detectar tienda online
    if (allText.includes('tienda online') || allText.includes('ecommerce') ||
        allText.includes('página web') || allText.includes('vendo online')) {
      memory.hasOnlineStore = true;
      memory.questionsAnswered.push('tienda_online');
    }

    // Detectar inversión en publicidad
    if (allText.includes('publicidad') || allText.includes('ads') ||
        allText.includes('facebook ads') || allText.includes('meta ads') ||
        allText.includes('invierto en')) {
      memory.investsInAds = true;
      memory.questionsAnswered.push('publicidad');
    }

    // Extraer pain points (crítico para calificación)
    this.extractionPatterns.pain.forEach(signal => {
      if (allText.includes(signal)) {
        if (!memory.painPoints.includes(signal)) {
          memory.painPoints.push(signal);
        }
      }
    });

    // Extraer señales positivas
    this.extractionPatterns.positive.forEach(signal => {
      if (allText.includes(signal)) {
        if (!memory.positiveSignals.includes(signal)) {
          memory.positiveSignals.push(signal);
        }
      }
    });

    // Calcular nivel de frustración
    if (memory.painPoints.length >= 3) {
      memory.frustrationLevel = 'high';
      memory.stageReached = 'qualified';
    } else if (memory.painPoints.length >= 1) {
      memory.frustrationLevel = 'medium';
    }

    // Analizar tono del usuario
    memory.userTone = this.analyzeUserTone(userMessages);

    // Analizar nivel de engagement
    memory.engagementLevel = this.analyzeEngagement(userMessages);

    // Tracking del flujo conversacional
    memory.conversationFlow = this.trackConversationFlow(history);

    if (memory.conversationFlow.length > 0) {
      memory.lastTopicDiscussed = memory.conversationFlow[memory.conversationFlow.length - 1];
    }

    // Determinar tópicos ya discutidos
    memory.topicsDiscussed = this.extractTopicsDiscussed(history);

    return memory;
  }

  /**
   * Analiza el tono del usuario
   */
  analyzeUserTone(userMessages) {
    if (userMessages.length === 0) return 'neutral';

    const lastMessages = userMessages.slice(-3);
    const text = lastMessages.map(m => m.content.toLowerCase()).join(' ');

    // Frustrado
    if (text.includes('frustrad') || text.includes('cansad') || text.includes('harto') ||
        text.includes('mal') || text.includes('no funciona')) {
      return 'frustrated';
    }

    // Entusiasta
    if (text.includes('genial') || text.includes('bacán') || text.includes('excelente') ||
        text.includes('!') || text.includes('súper')) {
      return 'enthusiastic';
    }

    // Casual
    if (text.includes('hola') || text.includes('que onda') || text.includes('cacho')) {
      return 'casual';
    }

    return 'neutral';
  }

  /**
   * Analiza nivel de engagement
   */
  analyzeEngagement(userMessages) {
    if (userMessages.length === 0) return 'low';

    const avgLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;

    // Mensajes largos (>50 chars) = high engagement
    if (avgLength > 50) return 'high';

    // Mensajes cortos (<15 chars) = low engagement
    if (avgLength < 15) return 'low';

    return 'medium';
  }

  /**
   * Rastrea el flujo de la conversación
   */
  trackConversationFlow(history) {
    const flow = [];

    history.forEach(msg => {
      const text = msg.content.toLowerCase();

      if (text.includes('tienda') || text.includes('ecommerce')) {
        if (!flow.includes('tienda_online')) flow.push('tienda_online');
      }
      if (text.includes('shopify') || text.includes('plataforma')) {
        if (!flow.includes('plataforma')) flow.push('plataforma');
      }
      if (text.includes('vendo') || text.includes('negocio')) {
        if (!flow.includes('tipo_negocio')) flow.push('tipo_negocio');
      }
      if (text.includes('publicidad') || text.includes('ads')) {
        if (!flow.includes('publicidad')) flow.push('publicidad');
      }
      if (text.includes('ventas') || text.includes('resultados')) {
        if (!flow.includes('resultados')) flow.push('resultados');
      }
      if (text.includes('reunión') || text.includes('llamada') || text.includes('agendar')) {
        if (!flow.includes('reunion_propuesta')) flow.push('reunion_propuesta');
      }
    });

    return flow;
  }

  /**
   * Extrae tópicos discutidos
   */
  extractTopicsDiscussed(history) {
    const topics = new Set();
    const text = history.map(h => h.content.toLowerCase()).join(' ');

    const topicKeywords = {
      'tienda_online': ['tienda', 'ecommerce', 'online'],
      'plataforma': ['shopify', 'woocommerce', 'plataforma'],
      'productos': ['vendo', 'productos', 'artículos'],
      'publicidad': ['ads', 'publicidad', 'anuncios', 'facebook', 'meta'],
      'ventas': ['ventas', 'vender', 'facturación'],
      'resultados': ['resultados', 'conversión', 'roi'],
      'precio': ['precio', 'cuánto', 'costo', 'plan'],
      'reunion': ['reunión', 'llamada', 'demo', 'agendar'],
    };

    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(kw => text.includes(kw))) {
        topics.add(topic);
      }
    });

    return Array.from(topics);
  }

  /**
   * Genera contexto enriquecido para el LLM
   * Este reemplaza las instrucciones dinámicas tradicionales
   */
  generateEnrichedContext(memory, currentState) {
    let context = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += '📊 MEMORIA CONVERSACIONAL\n';
    context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    // Perfil del lead
    context += '\n👤 PERFIL DEL LEAD:\n';
    if (memory.name) context += `- Nombre: ${memory.name}\n`;
    if (memory.platform) context += `- Plataforma: ${memory.platform}\n`;
    if (memory.business) context += `- Negocio: ${memory.business}\n`;
    if (memory.hasOnlineStore !== null) context += `- Tienda online: ${memory.hasOnlineStore ? 'Sí' : 'No'}\n`;
    if (memory.investsInAds !== null) context += `- Invierte en ads: ${memory.investsInAds ? 'Sí' : 'No'}\n`;

    // Estado emocional (crítico para adaptar tono)
    if (memory.painPoints.length > 0 || memory.frustrationLevel !== 'none') {
      context += '\n⚠️ SEÑALES DE DOLOR:\n';
      if (memory.painPoints.length > 0) {
        context += `- Problemas mencionados: ${memory.painPoints.join(', ')}\n`;
      }
      context += `- Nivel de frustración: ${memory.frustrationLevel}\n`;
    }

    if (memory.positiveSignals.length > 0) {
      context += '\n✅ SEÑALES POSITIVAS:\n';
      context += `- ${memory.positiveSignals.join(', ')}\n`;
      context += '⚠️ Si le va bien, tal vez no necesita Datapify ahora.\n';
    }

    // Progreso de calificación
    context += '\n📋 PROGRESO:\n';
    context += `- Preguntas respondidas: ${memory.questionsAnswered.join(', ') || 'ninguna'}\n`;
    context += `- Stage: ${memory.stageReached}\n`;
    context += `- Tono del usuario: ${memory.userTone}\n`;
    context += `- Engagement: ${memory.engagementLevel}\n`;

    // Lo que falta descubrir (crítico)
    const missing = [];
    if (!memory.hasOnlineStore) missing.push('¿Tiene tienda online?');
    if (memory.hasOnlineStore && !memory.platform) missing.push('¿Qué plataforma usa?');
    if (memory.platform === 'Shopify' && !memory.business) missing.push('¿Qué vende?');
    if (memory.platform === 'Shopify' && !memory.investsInAds && memory.painPoints.length === 0) {
      missing.push('¿Cómo le va? ¿Tiene problemas con ventas/publicidad?');
    }

    if (missing.length > 0) {
      context += '\n❓ LO QUE TE FALTA DESCUBRIR:\n';
      missing.forEach(q => context += `- ${q}\n`);
      context += '\n💡 Descubre esto conversando natural. NO interrogues.\n';
    }

    // Recomendación de acción
    context += '\n🎯 PRÓXIMO PASO:\n';
    if (memory.platform === 'Shopify' && memory.painPoints.length > 0 && !currentState.alreadyOfferedMeeting) {
      context += '✅ Tiene Shopify + dolor confirmado → OFRECE REUNIÓN\n';
    } else if (missing.length > 0) {
      context += `Descubre: ${missing[0]}\n`;
    } else if (currentState.alreadyOfferedMeeting) {
      context += '⏳ Ya ofreciste reunión. Espera confirmación.\n';
    }

    // Contexto del flujo
    if (memory.lastTopicDiscussed) {
      context += `\n💬 Último tema: ${memory.lastTopicDiscussed}\n`;
    }

    context += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    return context;
  }

  /**
   * Calcula score de conversión (0-100)
   * Basado en señales de la conversación
   */
  calculateConversionScore(memory) {
    let score = 0;

    // Tiene Shopify (+30)
    if (memory.platform === 'Shopify') score += 30;

    // Expresó dolor (+40)
    if (memory.painPoints.length >= 2) score += 40;
    else if (memory.painPoints.length === 1) score += 20;

    // Engagement alto (+10)
    if (memory.engagementLevel === 'high') score += 10;

    // Invierte en publicidad (+10)
    if (memory.investsInAds) score += 10;

    // Tono frustrado (+10, indica urgencia)
    if (memory.userTone === 'frustrated') score += 10;

    // Penalizaciones
    // Si le va bien (-30)
    if (memory.positiveSignals.length > 0) score -= 30;

    // Si no es Shopify (-50)
    if (memory.platform && memory.platform !== 'Shopify') score -= 50;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Genera resumen ejecutivo de la conversación
   */
  generateConversationSummary(memory, conversationScore) {
    const summary = {
      leadProfile: {
        name: memory.name || 'Desconocido',
        platform: memory.platform || 'No especificado',
        business: memory.business || 'No especificado',
        hasOnlineStore: memory.hasOnlineStore,
      },
      qualification: {
        score: conversationScore,
        temperature: conversationScore >= 70 ? 'hot' : conversationScore >= 40 ? 'warm' : 'cold',
        painPoints: memory.painPoints,
        positiveSignals: memory.positiveSignals,
        frustrationLevel: memory.frustrationLevel,
      },
      engagement: {
        tone: memory.userTone,
        level: memory.engagementLevel,
        questionsAnswered: memory.questionsAnswered.length,
        topicsDiscussed: memory.topicsDiscussed.length,
      },
      recommendation: this.generateRecommendation(memory, conversationScore),
    };

    return summary;
  }

  /**
   * Genera recomendación basada en memoria
   */
  generateRecommendation(memory, score) {
    if (score >= 70) {
      return 'Lead caliente. Priorizar agendamiento inmediato.';
    } else if (score >= 40) {
      return 'Lead tibio. Necesita más calificación.';
    } else if (memory.platform && memory.platform !== 'Shopify') {
      return 'No califica. Descalificar gentilmente.';
    } else if (memory.positiveSignals.length > 0) {
      return 'Le va bien. Probablemente no necesita Datapify ahora.';
    } else {
      return 'Lead frío. Necesita más descubrimiento.';
    }
  }
}

module.exports = new MemoryService();
