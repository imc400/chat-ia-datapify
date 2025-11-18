const OpenAI = require('openai');
const logger = require('../utils/logger');
const prisma = require('../db/prisma');

/**
 * DATA TAGGER SERVICE
 *
 * Assistant de OpenAI dedicado SOLO a etiquetar información de leads.
 * Trabaja en paralelo con el Sales Assistant.
 *
 * Funciones disponibles:
 * - tag_lead_info: Etiqueta información detectada del usuario
 * - update_lead_status: Actualiza score, temperatura y outcome
 */
class DataTaggerService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // ID del Assistant de etiquetado (crear manualmente en OpenAI)
    this.assistantId = process.env.OPENAI_TAGGER_ASSISTANT_ID;

    if (!this.assistantId) {
      logger.warn('⚠️ OPENAI_TAGGER_ASSISTANT_ID no configurado. Etiquetado desactivado.');
    } else {
      logger.info('✅ Data Tagger Service inicializado', {
        assistantId: this.assistantId,
      });
    }
  }

  /**
   * Analiza una conversación y etiqueta información automáticamente
   *
   * @param {string} userMessage - Último mensaje del usuario
   * @param {string} conversationId - ID de la conversación
   * @param {Array} history - Historial de mensajes
   */
  async analyzeAndTag(userMessage, conversationId, history) {
    try {
      if (!this.assistantId) {
        logger.warn('⚠️ Tagger Assistant no configurado, saltando etiquetado');
        return null;
      }

      const startTime = Date.now();

      // 1. Crear o recuperar thread para este análisis
      // Usamos un thread separado del Sales Assistant
      const threadId = await this.getOrCreateTaggerThread(conversationId);

      // 2. Construir contexto de análisis
      const analysisPrompt = this.buildAnalysisPrompt(userMessage, history);

      // 3. Agregar mensaje al thread
      await this.openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: analysisPrompt,
      });

      // 4. Ejecutar el Assistant con funciones disponibles
      const run = await this.openai.beta.threads.runs.create(threadId, {
        assistant_id: this.assistantId,
        tools: this.getAvailableTools(),
      });

      // 5. Esperar y manejar tool calls
      const completedRun = await this.waitForRunWithToolCalls(threadId, run.id, conversationId);

      const processingTime = Date.now() - startTime;

      logger.info('✅ Data Tagger completado', {
        conversationId,
        processingTime: `${processingTime}ms`,
        toolCallsExecuted: completedRun.toolCallsCount || 0,
      });

      return {
        success: true,
        processingTime,
        toolCallsExecuted: completedRun.toolCallsCount || 0,
      };

    } catch (error) {
      logger.error('❌ Error en Data Tagger:', {
        error: error.message,
        conversationId,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Construye el prompt de análisis para el Tagger Assistant
   */
  buildAnalysisPrompt(userMessage, history) {
    let prompt = '# CONVERSACIÓN PARA ANALIZAR\n\n';

    // Incluir últimos 5 mensajes para contexto
    const recentHistory = history.slice(-5);
    recentHistory.forEach(msg => {
      const role = msg.role === 'user' || msg.role === 'usuario' ? 'USUARIO' : 'AGENTE';
      prompt += `${role}: ${msg.content}\n`;
    });

    // Agregar mensaje actual
    prompt += `USUARIO: ${userMessage}\n\n`;

    prompt += '---\n\n';
    prompt += '# TU TAREA\n';
    prompt += 'Analiza SOLO los mensajes del USUARIO (no del AGENTE).\n';
    prompt += 'Detecta y etiqueta cualquier información clave llamando a las funciones apropiadas.\n';
    prompt += 'Si no hay información nueva que etiquetar, no hagas nada.\n';

    return prompt;
  }

  /**
   * Define las herramientas disponibles para el Assistant
   */
  getAvailableTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'tag_lead_info',
          description: 'Etiqueta información detectada del lead en la base de datos',
          parameters: {
            type: 'object',
            properties: {
              hasShopify: {
                type: 'boolean',
                description: 'true si el usuario confirmó que usa Shopify, false si usa otra plataforma',
              },
              name: {
                type: 'string',
                description: 'Nombre del usuario si lo mencionó',
              },
              email: {
                type: 'string',
                description: 'Email del usuario si lo proporcionó',
              },
              businessType: {
                type: 'string',
                description: 'Tipo de negocio (ej: "ropa deportiva", "cosméticos")',
              },
              monthlyRevenueCLP: {
                type: 'number',
                description: 'Ventas mensuales en CLP. Ejemplos: 5 palos = 5000000, 8 millones = 8000000',
              },
              investsInAds: {
                type: 'boolean',
                description: 'true si mencionó que invierte en publicidad',
              },
              adSpendMonthlyCLP: {
                type: 'number',
                description: 'Gasto mensual en publicidad en CLP',
              },
              painPoints: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array de problemas o frustraciones mencionadas',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_lead_status',
          description: 'Actualiza el score, temperatura y outcome del lead',
          parameters: {
            type: 'object',
            properties: {
              leadScore: {
                type: 'number',
                description: 'Score del lead de 0-10',
                minimum: 0,
                maximum: 10,
              },
              leadTemperature: {
                type: 'string',
                enum: ['hot', 'warm', 'cold'],
                description: 'Temperatura del lead',
              },
              readyToSchedule: {
                type: 'boolean',
                description: 'true si el lead está listo para agendar reunión',
              },
              outcome: {
                type: 'string',
                enum: ['scheduled', 'disqualified', 'pending', 'abandoned'],
                description: 'Resultado de la conversación',
              },
            },
          },
        },
      },
    ];
  }

  /**
   * Espera a que el run termine, manejando tool calls
   */
  async waitForRunWithToolCalls(threadId, runId, conversationId, maxWaitTime = 30000) {
    const startTime = Date.now();
    const pollInterval = 500;
    let toolCallsCount = 0;

    while (Date.now() - startTime < maxWaitTime) {
      const run = await this.openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });

      logger.debug('🔄 Tagger run status:', run.status);

      // Run completado
      if (run.status === 'completed') {
        return { ...run, toolCallsCount };
      }

      // Run requiere action (tool calls)
      if (run.status === 'requires_action') {
        const toolCalls = run.required_action.submit_tool_outputs.tool_calls;

        logger.info('🔧 Ejecutando tool calls del Tagger', {
          count: toolCalls.length,
          functions: toolCalls.map(tc => tc.function.name),
        });

        // Ejecutar cada tool call
        const toolOutputs = await this.executeToolCalls(toolCalls, conversationId);
        toolCallsCount += toolCalls.length;

        // Submit outputs
        await this.openai.beta.threads.runs.submitToolOutputs(runId, {
          thread_id: threadId,
          tool_outputs: toolOutputs,
        });

        continue;
      }

      // Run falló
      if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
        const errorMessage = run.last_error?.message || 'Unknown error';

        // Si es rate limit, extraer tiempo de espera y reintentar
        if (errorMessage.includes('Rate limit reached')) {
          const match = errorMessage.match(/try again in ([\d.]+)s/);
          if (match) {
            const waitSeconds = parseFloat(match[1]);
            logger.warn(`⏳ Data Tagger rate limit. Esperando ${waitSeconds}s antes de reintentar...`);

            await new Promise(resolve => setTimeout(resolve, (waitSeconds + 1) * 1000));

            // Reintentar el run
            logger.info('🔄 Reintentando Data Tagger después de rate limit...');
            const newRun = await this.openai.beta.threads.runs.create(threadId, {
              assistant_id: this.assistantId,
              tools: this.getAvailableTools(),
            });
            return this.waitForRunWithToolCalls(threadId, newRun.id, conversationId, maxWaitTime);
          }
        }

        throw new Error(`Tagger run ${run.status}: ${errorMessage}`);
      }

      // Esperar antes de siguiente check
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Tagger run timeout después de ${maxWaitTime}ms`);
  }

  /**
   * Ejecuta los tool calls solicitados por el Assistant
   */
  async executeToolCalls(toolCalls, conversationId) {
    const outputs = [];

    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      logger.info(`🔨 Ejecutando función: ${functionName}`, { args });

      let result;

      try {
        if (functionName === 'tag_lead_info') {
          result = await this.tagLeadInfo(conversationId, args);
        } else if (functionName === 'update_lead_status') {
          result = await this.updateLeadStatus(conversationId, args);
        } else {
          result = { success: false, error: 'Función desconocida' };
        }

        outputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify(result),
        });

      } catch (error) {
        logger.error(`❌ Error ejecutando ${functionName}:`, error);
        outputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify({ success: false, error: error.message }),
        });
      }
    }

    return outputs;
  }

  /**
   * FUNCTION: tag_lead_info
   * Guarda información del lead en la BD
   */
  async tagLeadInfo(conversationId, data) {
    try {
      // Obtener conversación y lead asociado
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { leadData: true },
      });

      if (!conversation) {
        throw new Error('Conversación no encontrada');
      }

      const phone = conversation.phone;

      // Preparar datos a actualizar
      const leadDataUpdates = {};

      if (data.hasShopify !== undefined) leadDataUpdates.hasShopify = data.hasShopify;
      if (data.name) leadDataUpdates.name = data.name;
      if (data.email) leadDataUpdates.email = data.email;
      if (data.businessType) leadDataUpdates.businessType = data.businessType;
      if (data.monthlyRevenueCLP) leadDataUpdates.monthlyRevenueCLP = BigInt(data.monthlyRevenueCLP);
      if (data.investsInAds !== undefined) leadDataUpdates.investsInAds = data.investsInAds;
      if (data.adSpendMonthlyCLP) leadDataUpdates.adSpendMonthlyCLP = BigInt(data.adSpendMonthlyCLP);

      // Pain points: agregar a los existentes
      if (data.painPoints && data.painPoints.length > 0) {
        const existingPainPoints = conversation.leadData?.painPoints || [];
        const newPainPoints = [...new Set([...existingPainPoints, ...data.painPoints])];
        leadDataUpdates.painPoints = newPainPoints;
      }

      // Actualizar o crear LeadData
      const leadData = await prisma.leadData.upsert({
        where: { phone },
        update: leadDataUpdates,
        create: {
          phone,
          ...leadDataUpdates,
        },
      });

      // Vincular conversation con leadData si no estaba vinculado
      if (!conversation.leadDataId) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { leadDataId: leadData.id },
        });
      }

      logger.info('✅ Lead info etiquetada', {
        phone,
        updatedFields: Object.keys(leadDataUpdates),
      });

      return {
        success: true,
        updatedFields: Object.keys(leadDataUpdates),
      };

    } catch (error) {
      logger.error('❌ Error en tag_lead_info:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * FUNCTION: update_lead_status
   * Actualiza score, temperatura y outcome
   */
  async updateLeadStatus(conversationId, data) {
    try {
      const updates = {};

      if (data.leadScore !== undefined) updates.leadScore = data.leadScore;
      if (data.leadTemperature) updates.leadTemperature = data.leadTemperature;
      if (data.outcome) updates.outcome = data.outcome;

      // scheduledMeeting se deriva de outcome
      if (data.outcome === 'scheduled') {
        updates.scheduledMeeting = true;
      }

      await prisma.conversation.update({
        where: { id: conversationId },
        data: updates,
      });

      logger.info('✅ Lead status actualizado', {
        conversationId,
        updates,
      });

      return {
        success: true,
        updatedFields: Object.keys(updates),
      };

    } catch (error) {
      logger.error('❌ Error en update_lead_status:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtiene o crea thread para el Tagger (SEPARADO del Sales thread)
   */
  async getOrCreateTaggerThread(conversationId) {
    try {
      // Buscar si ya existe un thread de tagger para esta conversación
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { taggerThreadId: true },
      });

      if (conversation?.taggerThreadId) {
        logger.debug('♻️ Reutilizando taggerThreadId existente:', conversation.taggerThreadId);
        return conversation.taggerThreadId;
      }

      // Si no existe, crear uno nuevo para el Data Tagger
      const thread = await this.openai.beta.threads.create();

      logger.info('🆕 Creando nuevo taggerThreadId:', thread.id);

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { taggerThreadId: thread.id },
      });

      return thread.id;

    } catch (error) {
      logger.error('❌ Error obteniendo thread para Tagger:', error);
      throw error;
    }
  }
}

module.exports = new DataTaggerService();
