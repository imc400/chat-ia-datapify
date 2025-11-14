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
    };

    const allText = history.map(h => h.content.toLowerCase()).join(' ');

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

    // Detectar si tiene tienda online
    if (allText.includes('tienda') || allText.includes('ecommerce') || allText.includes('e-commerce') || allText.includes('vendo online')) {
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
    const assistantMessages = history.filter(h => h.role === 'assistant');
    assistantMessages.forEach(msg => {
      const text = msg.content.toLowerCase();
      if (text.includes('llamo') || text.includes('tu nombre')) state.alreadyAskedName = true;
      if (text.includes('shopify') || text.includes('plataforma')) state.alreadyAskedPlatform = true;
      if (text.includes('qué vendes') || text.includes('a qué te dedicas')) state.alreadyAskedBusiness = true;
      if (text.includes('reunión') || text.includes('agendar') || text.includes('te tinca')) state.alreadyOfferedMeeting = true;
      if (text.includes('?')) state.questionsAsked++;
    });

    // Determinar fase
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

    // Instrucciones según fase
    if (state.phase === 'APERTURA') {
      instructions = `FASE: APERTURA
- Saluda de forma natural y humana
- Pregunta en qué puedes ayudar o a qué se dedica
- NO preguntes nada más aún
- Máximo 2 líneas`;
    }

    if (state.phase === 'DESCUBRIMIENTO') {
      if (!state.hasOnlineStore && !state.alreadyAskedBusiness) {
        instructions = `FASE: DESCUBRIMIENTO
- Aún no sabemos si tiene tienda online
- Pregunta de forma natural: "¿Tienes tienda online?" o "¿Vendes online?"
- NO preguntes por Shopify todavía
- Máximo 2 líneas, 1 pregunta`;
      } else if (state.hasOnlineStore && !state.platform && !state.alreadyAskedPlatform) {
        instructions = `FASE: DESCUBRIMIENTO
- Ya sabemos que tiene tienda online
- Ahora pregunta naturalmente: "¿Está en Shopify o en otra plataforma?"
- NO hagas otras preguntas
- Máximo 2 líneas`;
      }
    }

    if (state.phase === 'CALIFICACIÓN') {
      instructions = `FASE: CALIFICACIÓN
- Usuario tiene Shopify ✅
- Ahora descubre su situación: ventas, publicidad, frustraciones
- Haz UNA pregunta sobre su negocio
- Sé empático y curioso
- Máximo 2 líneas`;
    }

    if (state.phase === 'PROPUESTA' && state.readyToPropose) {
      instructions = `FASE: PROPUESTA
- Usuario califica (Shopify + interés)
- Es momento de proponer reunión
- Pregunta de forma natural: "¿Te tinca que veamos tu caso en 30 min?"
- NO seas vendedor, sé consultor
- Máximo 2 líneas`;
    }

    if (state.phase === 'CIERRE') {
      if (state.alreadyOfferedMeeting) {
        instructions = `FASE: CIERRE
- Ya ofreciste reunión
- Responde lo que necesite el usuario
- Si confirma, di EXACTAMENTE: "Perfecto, te paso el link para agendar"
- Máximo 2 líneas`;
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
