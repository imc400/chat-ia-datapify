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

    // Contar preguntas que YA hicimos
    const assistantMessages = history.filter(h => h.role === 'assistant' || h.role === 'asistente');
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
      } else if (state.platform === 'shopify' && !state.hasBusinessInfo) {
        state.phase = 'CALIFICACIÓN';
      } else if (state.platform === 'shopify' && state.hasBusinessInfo && !state.alreadyOfferedMeeting) {
        state.phase = 'PROPUESTA';
        state.readyToPropose = true;
      } else {
        state.phase = 'CIERRE';
      }
    }

    return state;
  }

  /**
   * Genera instrucciones dinámicas basadas en el estado
   * Esto controla qué debe hacer el agente AHORA
   */
  generateDynamicInstructions(state) {
    let instructions = '';

    // Si debe descalificar
    if (state.shouldDescalify) {
      if (state.descalifyReason === 'no_online_store') {
        return `DESCALIFICAR: El usuario no tiene tienda online. Responde: "Datapify es para tiendas online. Cuando tengas una, hablamos :)" y TERMINA la conversación.`;
      }
      if (state.descalifyReason === 'not_shopify') {
        return `DESCALIFICAR: El usuario no usa Shopify. Responde: "Datapify funciona solo con Shopify. Si migras en el futuro, conversamos :)" y TERMINA la conversación.`;
      }
    }

    // Instrucciones según fase (GUÍAS conversacionales, NO scripts)
    if (state.phase === 'APERTURA') {
      instructions = `━━━ CONTEXTO: Primera interacción ━━━

Esta persona acaba de llegar. Tu trabajo es entender qué busca de forma genuina.

Sé curioso. Pregunta sobre su negocio o qué lo trae por acá.
Conversa como si fuera el primer WhatsApp con un emprendedor que viste en LinkedIn.`;
    }

    if (state.phase === 'DESCUBRIMIENTO') {
      if (!state.hasOnlineStore && !state.alreadyAskedBusiness) {
        instructions = `━━━ CONTEXTO: Descubriendo su negocio ━━━

No sabes si tiene tienda online (requisito para Datapify).

Averigua esto conversacionalmente. No seas directo tipo "¿tienes tienda online?"
Mejor algo como "¿Cómo vendes actualmente?" o "Cuéntame de tu tienda"`;
      } else if (state.hasOnlineStore && !state.platform && !state.alreadyAskedPlatform) {
        instructions = `━━━ CONTEXTO: Calificando plataforma (CRÍTICO) ━━━

Tiene tienda/página web ✅, pero NO sabes qué plataforma usa.

🚨 CRÍTICO: Solo trabajas con Shopify. Debes preguntar la plataforma AHORA.

NO asumas nada. NO hables de "frustración con ads" si no la mencionó.
NO ofrezcas reunión todavía.

Pregunta directa y natural:
• "Buena! ¿Qué plataforma usas? ¿Shopify, WooCommerce...?"
• "¿Vendes por Shopify o usas otra cosa?"

Solo cuando CONFIRME Shopify → puedes seguir descubriendo dolor.`;
      }
    }

    if (state.phase === 'CALIFICACIÓN') {
      instructions = `━━━ CONTEXTO: Lead calificado (tiene Shopify) ━━━

Tiene Shopify ✅. Ahora descubre su DOLOR.

Pregunta sobre:
• ¿Cómo le va con la publicidad?
• ¿Está invirtiendo en ads?
• ¿Ve resultados o está frustrado?

Si expresa frustración o problema real → OFRECE REUNIÓN de inmediato.
Tu instinto de vendedor debe activarse aquí.`;
    }

    // 🔥 MOMENTO DE INTERVENCIÓN (prioridad máxima)
    if (state.interventionMoment) {
      instructions = `━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 LEAD CALIENTE - MOMENTO CRÍTICO
━━━━━━━━━━━━━━━━━━━━━━━━━━

Usuario expresó un DOLOR REAL + tiene Shopify ✅

Tu instinto de vendedor debe decirte: "Este es EL momento"

ESTRATEGIA:
1. Valida su frustración (empatiza 1 línea)
2. Conecta Datapify como solución (breve, 1 línea)
3. Ofrece reunión de 30 min para ver si les sirve

NO des consultoría gratis. NO diagnostiques en detalle.
Tu valor está en la demo personalizada, no en el chat.

Cierra con confianza pero sin presión. Conversacional, no vendedor agresivo.

Ejemplo de tono: "Cacho tu frustración. Datapify automatiza eso que estás haciendo manual. ¿Te tinca una llamada de 30 min para ver si te sirve?"`;
    } else if (state.phase === 'PROPUESTA' && state.readyToPropose) {
      instructions = `━━━ CONTEXTO: Momento de proponer reunión ━━━

Usuario califica (Shopify + contexto suficiente).

Ofrece reunión conversacionalmente. NO lo fuerces.

Ejemplos buenos:
• "¿Te tinca una llamada de 30 min para mostrarte cómo funciona?"
• "¿Quieres que agendemos 30 min para ver si Datapify te sirve?"

Evita sonar corporativo: "Me gustaría agendar una reunión con usted"`;
    }

    if (state.phase === 'CIERRE') {
      if (state.alreadyOfferedMeeting) {
        instructions = `━━━ CONTEXTO: Ya ofreciste reunión, esperando confirmación ━━━

CRÍTICO - Detección automática de confirmación:

Si usuario dice "sí", "dale", "ok", "perfecto", "sale", "demo", etc.:
→ Responde algo como: "Perfecto, te paso el link para agendar"
→ El sistema detectará esto y enviará el link de Google Calendar automáticamente

NO inventes horarios. NO digas "te envío el link" sin confirmar primero.
NO coordines fechas manualmente.

El link tiene un calendario donde ellos eligen fecha/hora.

Si usuario NO confirma (hace otra pregunta), responde esa pregunta primero.`;
      }
    }

    // Bloqueos de preguntas repetidas
    let blockedQuestions = '\n\nNO PREGUNTES (ya lo hiciste):';
    if (state.alreadyAskedName) blockedQuestions += '\n- Su nombre';
    if (state.alreadyAskedPlatform) blockedQuestions += '\n- Su plataforma';
    if (state.alreadyAskedBusiness) blockedQuestions += '\n- A qué se dedica';
    if (state.alreadyOfferedMeeting) blockedQuestions += '\n- Si quiere reunión (ya lo hiciste)';

    // Info que ya conocemos
    let knownInfo = '\n\nYA SABEMOS:';
    if (state.hasName) knownInfo += `\n- Nombre: ${state.name}`;
    if (state.platform) knownInfo += `\n- Plataforma: ${state.platform}`;
    if (state.hasBusinessInfo) knownInfo += `\n- Negocio: ${state.businessType}`;
    if (state.hasRevenueInfo) knownInfo += '\n- Tiene info de ventas';
    if (state.hasAdsInfo) knownInfo += '\n- Invierte en publicidad';

    return instructions + blockedQuestions + knownInfo;
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
