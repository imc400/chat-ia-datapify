const logger = require('../utils/logger');

/**
 * CAPA 3: Behaviour Controller
 * Controla el estado del usuario y las reglas del flujo
 * NO es responsabilidad del LLM, sino del backend
 */
class BehaviourController {
  /**
   * Analiza el estado actual de la conversación
   * Retorna qué sabemos del usuario y en qué fase está
   */
  analyzeConversationState(history) {
    const state = {
      // Datos del usuario
      hasName: false,
      name: null,
      hasOnlineStore: null, // null = no sabemos, true/false = sí/no
      platform: null, // null = no sabemos, 'shopify', 'other'
      hasBusinessInfo: false,
      businessType: null,
      hasRevenueInfo: false,
      hasAdsInfo: false,
      showedInterest: false,
      hasPainPoint: false, // NUEVO: ¿Expresó frustración o problema?
      askedAboutAds: false, // NUEVO: ¿Ya preguntamos por publicidad?

      // Control de flujo
      questionsAsked: 0,
      messagesCount: history.length,
      alreadyAskedName: false,
      alreadyAskedPlatform: false,
      alreadyAskedBusiness: false,
      alreadyOfferedMeeting: false,

      // Estado de la conversación
      phase: 'APERTURA', // APERTURA, DESCUBRIMIENTO, CALIFICACIÓN, PROPUESTA, CIERRE
      shouldDescalify: false,
      descalifyReason: null,
      readyToPropose: false,

      // 🔥 NUEVO: Detector de momento de intervención
      hotLeadSignals: false,
      interventionMoment: false,
    };

    const allText = history.map(h => h.content.toLowerCase()).join(' ');

    // 🔥 DETECTOR DE MOMENTO DE INTERVENCIÓN (HOT LEAD)
    // Señales de que el usuario está listo para solución inmediata
    const hotLeadSignals = [
      // Dolor explícito
      'necesito ayuda',
      'no me funciona',
      'no funciona',
      'mal',
      'frustrad',
      'cansad',
      'harto',
      'no vendo',
      'no logro',
      'no puedo',
      'no estoy viendo resultados',
      'no tengo resultados',
      'no compran', // NUEVO
      'no me compran', // NUEVO
      'no están comprando', // NUEVO

      // Admisión de fracaso
      'estoy invirtiendo y',
      'estoy gastando',
      'invierto en publicidad', // NUEVO
      'invierto en ads', // NUEVO
      'invierto pero', // NUEVO
      'invirtiendo pero', // NUEVO
      'mis ventas están',
      'mis ads no',
      'mi publicidad no',
      'nada me funciona',
      'he probado todo',
      'no sé', // NUEVO - señal de confusión = necesita ayuda
      'no lo sé', // NUEVO

      // Intención explícita
      'vi su anuncio',
      'vi este anuncio',
      'quiero saber si me pueden ayudar',
      'me gustaría que me ayuden',
      'pueden ayudarme',
      'necesito que me ayuden',
      'me gustaría más información', // NUEVO

      // Urgencia
      'lo antes posible',
      'urgente',
      'rápido',
      'ya',
    ];

    // Detectar si hay señales de HOT LEAD en el último mensaje del usuario
    const lastUserMessage = history.filter(h => h.role === 'user' || h.role === 'usuario').slice(-1)[0];
    if (lastUserMessage) {
      const userText = lastUserMessage.content.toLowerCase();
      state.hotLeadSignals = hotLeadSignals.some(signal => userText.includes(signal));
    }

    // Extraer nombre
    const namePatterns = [
      /me llamo (\w+)/i,
      /soy (\w+)/i,
      /mi nombre es (\w+)/i,
    ];
    for (const pattern of namePatterns) {
      const match = allText.match(pattern);
      if (match) {
        state.hasName = true;
        state.name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        break;
      }
    }

    // Detectar si tiene tienda online (más específico)
    const onlineStoreSignals = [
      'tienda online',
      'tienda en línea',
      'ecommerce',
      'e-commerce',
      'vendo online',
      'vendo por internet',
      'página web' // Agregado para detectar, pero NO es suficiente para intervenir
    ];

    if (onlineStoreSignals.some(signal => allText.includes(signal))) {
      state.hasOnlineStore = true;
    }

    if (allText.includes('no tengo tienda') || allText.includes('no vendo online')) {
      state.hasOnlineStore = false;
      state.shouldDescalify = true;
      state.descalifyReason = 'no_online_store';
    }

    // Detectar plataforma
    if (allText.includes('shopify')) {
      state.platform = 'shopify';
    } else if (allText.includes('woocommerce') || allText.includes('woo commerce') ||
               allText.includes('magento') || allText.includes('prestashop') ||
               allText.includes('vtex') || allText.includes('jumpseller')) {
      state.platform = 'other';
      state.shouldDescalify = true;
      state.descalifyReason = 'not_shopify';
    }

    // Detectar tipo de negocio
    const businessPatterns = [
      /vendo (\w+)/i,
      /tienda de (\w+)/i,
      /negocio de (\w+)/i,
    ];
    for (const pattern of businessPatterns) {
      const match = allText.match(pattern);
      if (match) {
        state.hasBusinessInfo = true;
        state.businessType = match[1];
        break;
      }
    }

    // Detectar info de revenue/ads
    if (allText.includes('millones') || allText.includes('palos') || allText.includes('factur')) {
      state.hasRevenueInfo = true;
    }
    if (allText.includes('publicidad') || allText.includes('ads') || allText.includes('meta') || allText.includes('facebook ads')) {
      state.hasAdsInfo = true;
    }

    // Detectar interés
    const interestSignals = ['me interesa', 'quiero saber', 'me gustaría', 'ayúdame', 'necesito', 'frustrad', 'cansad'];
    if (interestSignals.some(signal => allText.includes(signal))) {
      state.showedInterest = true;
    }

    // NUEVO: Detectar pain points (dolor/problema/frustración)
    const painPointSignals = [
      'no vendo', 'no estoy vendiendo', 'ventas bajas', 'pocas ventas',
      'no funciona', 'no me funciona', 'no sirve',
      'frustrad', 'cansad', 'harto', 'mal',
      'no me va bien', 'me va mal', 'resultados malos',
      'gasto mucho', 'pierdo plata', 'pierdo dinero',
      'no compran', 'no me compran',
      'cayeron las ventas', 'bajaron las ventas',
      'ads no funcionan', 'publicidad no funciona',
      'no veo resultados', 'sin resultados'
    ];

    if (painPointSignals.some(signal => allText.includes(signal))) {
      state.hasPainPoint = true;
    }

    // Contar preguntas que YA hicimos
    const assistantMessages = history.filter(h => h.role === 'assistant' || h.role === 'asistente');

    // Detectar si ya preguntamos por ads/publicidad
    const assistantAskedAboutAds = assistantMessages.some(msg => {
      const text = msg.content.toLowerCase();
      return (text.includes('publicidad') || text.includes('ads') || text.includes('anuncios')) && text.includes('?');
    });
    state.askedAboutAds = assistantAskedAboutAds;
    assistantMessages.forEach(msg => {
      const text = msg.content.toLowerCase();
      if (text.includes('llamo') || text.includes('tu nombre')) state.alreadyAskedName = true;
      if (text.includes('shopify') || text.includes('plataforma')) state.alreadyAskedPlatform = true;
      if (text.includes('qué vendes') || text.includes('a qué te dedicas') || text.includes('tienda online')) state.alreadyAskedBusiness = true;
      if (text.includes('reunión') || text.includes('agendar') || text.includes('te tinca') || text.includes('coordinemos')) state.alreadyOfferedMeeting = true;
      if (text.includes('?')) state.questionsAsked++;
    });

    // 🔥 MOMENTO DE INTERVENCIÓN
    // Si detecta HOT LEAD + SHOPIFY CONFIRMADO → saltar a PROPUESTA inmediata
    if (state.hotLeadSignals) {
      // Condiciones ESTRICTAS para intervención:
      // REQUIERE: Señales HOT + Shopify EXPLÍCITAMENTE confirmado

      const hasShopifyConfirmed =
        state.platform === 'shopify' ||
        allText.includes('uso shopify') ||
        allText.includes('tengo shopify') ||
        allText.includes('con shopify') ||
        allText.includes('en shopify');

      // SOLO intervenir si Shopify está CONFIRMADO (no solo "tiene tienda")
      if (hasShopifyConfirmed) {
        state.interventionMoment = true;
        state.readyToPropose = true;
        state.phase = 'PROPUESTA';
        logger.info('🔥 MOMENTO DE INTERVENCIÓN detectado - HOT LEAD + Shopify confirmado');
      } else {
        // Tiene dolor pero NO confirmó Shopify → Debe preguntar plataforma PRIMERO
        logger.info('⚠️ HOT LEAD detectado pero sin confirmar Shopify - debe calificar plataforma primero');
      }
    }

    // Determinar fase (solo si NO hay momento de intervención)
    if (!state.interventionMoment) {
      if (state.messagesCount <= 2) {
        state.phase = 'APERTURA';
      } else if (!state.hasOnlineStore || !state.platform) {
        state.phase = 'DESCUBRIMIENTO';
      } else if (state.platform === 'shopify' && !state.askedAboutAds) {
        // CRÍTICO: Tiene Shopify pero NO hemos preguntado por publicidad/dolor
        state.phase = 'CALIFICACIÓN';
      } else if (state.platform === 'shopify' && state.askedAboutAds && !state.hasPainPoint) {
        // Ya preguntamos por ads pero NO expresó dolor → seguir calificando
        state.phase = 'CALIFICACIÓN';
      } else if (state.platform === 'shopify' && state.hasPainPoint && !state.alreadyOfferedMeeting) {
        // Tiene Shopify + DOLOR confirmado → AHORA SÍ proponer
        state.phase = 'PROPUESTA';
        state.readyToPropose = true;
      } else {
        state.phase = 'CIERRE';
      }
    }

    return state;
  }

  /**
   * Genera instrucciones dinámicas SIMPLES basadas en el estado
   * Solo información de contexto, NO scripts
   */
  generateDynamicInstructions(state) {
    let instructions = '';
    let context = [];

    // Si debe descalificar
    if (state.shouldDescalify) {
      if (state.descalifyReason === 'no_online_store') {
        return `DESCALIFICAR: No tiene tienda online. Di algo como "Datapify es para tiendas online. Cuando tengas una, hablamos :)"`;
      }
      if (state.descalifyReason === 'not_shopify') {
        return `DESCALIFICAR: No usa Shopify. Di algo como "Datapify funciona solo con Shopify. Si migras algún día, conversamos :)"`;
      }
    }

    // ==========================================
    // CONTEXTO SIMPLE: Qué sabemos y qué falta
    // ==========================================

    // Lo que YA sabemos
    if (state.hasName) context.push(`Nombre: ${state.name}`);
    if (state.platform) context.push(`Plataforma: ${state.platform}`);
    if (state.hasBusinessInfo) context.push(`Vende: ${state.businessType}`);
    if (state.hasAdsInfo) context.push(`Invierte en publicidad`);
    if (state.hasPainPoint) context.push(`⚠️ Expresó problema/frustración`);

    // Lo que NO sabemos (esto es lo importante)
    let missing = [];
    if (!state.hasOnlineStore) missing.push('¿Tiene tienda online?');
    if (state.hasOnlineStore && !state.platform) missing.push('🚨 CRÍTICO: ¿Qué plataforma usa? DEBES preguntarlo AHORA antes de continuar');
    if (state.platform === 'shopify' && !state.hasBusinessInfo) missing.push('¿Qué vende?');
    if (state.platform === 'shopify' && !state.askedAboutAds) missing.push('¿Cómo le va con publicidad/ventas? ¿Tiene problemas?');
    if (state.platform === 'shopify' && state.askedAboutAds && !state.hasPainPoint) missing.push('¿Realmente tiene un problema? (si le va bien, no necesita Datapify)');

    // Construir instrucciones super simples
    let finalInstructions = '';

    if (context.length > 0) {
      finalInstructions += `\n━━━ LO QUE SABES ━━━\n${context.join('\n')}\n`;
    }

    if (missing.length > 0) {
      finalInstructions += `\n━━━ LO QUE TE FALTA SABER ━━━\n${missing.join('\n')}\n`;
      finalInstructions += `\nDescubre esto conversando natural. NO hagas lista de preguntas. Ve paso a paso.`;
    }

    // Si ya tiene todo y tiene dolor → ofrece reunión
    if (state.platform === 'shopify' && state.hasPainPoint && !state.alreadyOfferedMeeting) {
      finalInstructions += `\n\n✅ CALIFICADO CORRECTAMENTE:
- Plataforma: Shopify confirmado ✓
- Problema detectado ✓
- Ofrecer reunión: "¿Te tinca una llamada de 30 min para ver cómo te podemos ayudar?"`;
    }

    // BLOQUEO CRÍTICO: Tiene dolor pero NO confirmó plataforma
    if (state.hasPainPoint && !state.platform && !state.alreadyOfferedMeeting) {
      finalInstructions += `\n\n🚫 PROHIBIDO OFRECER REUNIÓN
Razón: Usuario expresó problema pero NO has confirmado que use Shopify
Próxima pregunta OBLIGATORIA: "¿En qué plataforma está tu tienda? ¿Shopify, WooCommerce...?"`;
    }

    // Si ya ofreció reunión
    if (state.alreadyOfferedMeeting) {
      finalInstructions += `\n\n⏳ Ya ofreciste reunión. Espera confirmación.
Si dice "sí", "dale", "ok" → responde "Dale, te paso el link" (el sistema enviará automático)`;
    }

    // Prevenir preguntas repetidas
    if (state.alreadyAskedPlatform) finalInstructions += `\n\n⚠️ YA preguntaste por plataforma, no vuelvas a hacerlo`;
    if (state.askedAboutAds) finalInstructions += `\n\n⚠️ YA preguntaste por publicidad/ventas`;

    return finalInstructions || 'Conversa natural para descubrir si califica para Datapify.';
  }

  /**
   * Valida que la respuesta del agente cumpla las reglas
   * Si no cumple, la rechaza y pide nueva
   */
  validateResponse(response, state) {
    const errors = [];

    // Regla 1: Máximo 2 líneas (o ~200 caracteres)
    const lines = response.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 3 || response.length > 250) {
      errors.push('Respuesta muy larga (máx 2-3 líneas)');
    }

    // Regla 2: Máximo 1 pregunta
    const questionMarks = (response.match(/\?/g) || []).length;
    if (questionMarks > 1) {
      errors.push('Más de 1 pregunta');
    }

    // Regla 3: No usar nombre en cada mensaje
    if (state.hasName && response.toLowerCase().includes(state.name.toLowerCase())) {
      // Permitir 1 de cada 5 mensajes
      if (state.messagesCount % 5 !== 0) {
        errors.push('Usando nombre muy frecuentemente');
      }
    }

    // Regla 4: No repetir palabras chilenas
    const chileanWords = ['bacán', 'bakán', 'genial', 'demás', 'tinca'];
    const usedChileanWords = chileanWords.filter(w => response.toLowerCase().includes(w));
    if (usedChileanWords.length > 1) {
      errors.push('Demasiadas palabras chilenas en un mensaje');
    }

    // Regla 5: No hacer preguntas bloqueadas
    if (state.alreadyAskedName && (response.toLowerCase().includes('cómo te llamas') || response.toLowerCase().includes('tu nombre'))) {
      errors.push('Preguntando nombre otra vez');
    }
    if (state.alreadyAskedPlatform && response.toLowerCase().includes('shopify') && response.includes('?')) {
      errors.push('Preguntando por Shopify otra vez');
    }

    return {
      valid: errors.length === 0,
      errors,
      response,
    };
  }
}

module.exports = new BehaviourController();
