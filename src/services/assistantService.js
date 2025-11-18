const OpenAI = require('openai');
const logger = require('../utils/logger');
const prisma = require('../db/prisma');

/**
 * OPENAI ASSISTANT SERVICE
 *
 * Integra OpenAI Assistants API para conversaciones de WhatsApp.
 * Cada conversación tiene su propio thread persistente en OpenAI.
 *
 * Ventajas:
 * - OpenAI maneja el historial automáticamente
 * - Instrucciones centralizadas en platform.openai.com
 * - Soporte para functions, code interpreter, file search
 */
class AssistantService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.assistantId = process.env.OPENAI_ASSISTANT_ID;

    if (!this.assistantId) {
      logger.warn('⚠️ OPENAI_ASSISTANT_ID no configurado. Usando chat completions como fallback.');
    } else {
      logger.info('✅ Assistant Service inicializado', {
        assistantId: this.assistantId,
      });
    }
  }

  /**
   * Genera respuesta usando OpenAI Assistant
   *
   * @param {string} userMessage - Mensaje del usuario
   * @param {string} conversationId - ID de la conversación en BD
   * @param {Object} thinkingAnalysis - Análisis del Thinking Engine (opcional)
   * @returns {string} - Respuesta del assistant
   */
  async generateResponse(userMessage, conversationId, thinkingAnalysis = null) {
    try {
      if (!this.assistantId) {
        throw new Error('Assistant ID no configurado');
      }

      const startTime = Date.now();

      // 1. Obtener o crear thread de OpenAI para esta conversación
      const threadId = await this.getOrCreateThread(conversationId);

      logger.info('🧵 Thread obtenido', {
        conversationId,
        threadId: threadId.substring(0, 20) + '...',
      });

      // 2. Agregar mensaje del usuario al thread
      await this.openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: userMessage,
      });

      // 3. (Opcional) Agregar contexto del Thinking Engine si está disponible
      if (thinkingAnalysis) {
        const contextMessage = this.buildContextFromThinking(thinkingAnalysis);
        if (contextMessage) {
          await this.openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: contextMessage,
          });
          logger.info('🧠 Contexto del Thinking Engine agregado al thread');
        }
      }

      // 4. Ejecutar el Assistant
      logger.info('🤖 Ejecutando Assistant...', { assistantId: this.assistantId });

      const run = await this.openai.beta.threads.runs.create(threadId, {
        assistant_id: this.assistantId,
      });

      // 5. Esperar a que el Assistant termine
      logger.info('📊 Llamando waitForRunCompletion', {
        threadId,
        runId: run.id,
        threadIdType: typeof threadId,
        runIdType: typeof run.id,
      });
      const completedRun = await this.waitForRunCompletion(threadId, run.id);

      // 6. Obtener la respuesta del Assistant
      const messages = await this.openai.beta.threads.messages.list(threadId, {
        order: 'desc',
        limit: 1,
      });

      const assistantMessage = messages.data[0];
      const responseText = assistantMessage.content[0].text.value;

      const responseTime = Date.now() - startTime;

      logger.info('✅ Respuesta del Assistant generada', {
        conversationId,
        responseLength: responseText.length,
        responseTime: `${responseTime}ms`,
        runId: run.id,
      });

      return responseText;

    } catch (error) {
      logger.error('❌ Error generando respuesta con Assistant:', {
        error: error.message,
        conversationId,
        assistantId: this.assistantId,
      });
      throw error;
    }
  }

  /**
   * Obtiene el thread de OpenAI asociado a una conversación,
   * o crea uno nuevo si no existe
   */
  async getOrCreateThread(conversationId) {
    try {
      // Buscar si ya existe un thread asociado a esta conversación
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { openaiThreadId: true },
      });

      if (conversation?.openaiThreadId) {
        // Thread ya existe, verificar que sea válido
        try {
          // Intentar recuperar el thread para verificar que existe
          await this.openai.beta.threads.retrieve(conversation.openaiThreadId);
          logger.debug('Thread existente válido', { threadId: conversation.openaiThreadId });
          return conversation.openaiThreadId;
        } catch (error) {
          // Thread no existe o es inválido (404), crear uno nuevo
          if (error.status === 404) {
            logger.warn('⚠️ Thread inválido detectado, creando nuevo', {
              oldThreadId: conversation.openaiThreadId,
              error: error.message,
            });
            // El thread será creado abajo
          } else {
            throw error; // Otro tipo de error
          }
        }
      }

      // Crear nuevo thread en OpenAI
      logger.info('🆕 Creando nuevo thread en OpenAI', { conversationId });

      const thread = await this.openai.beta.threads.create();

      // Guardar thread ID en la conversación
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { openaiThreadId: thread.id },
      });

      logger.info('✅ Thread creado y guardado', {
        conversationId,
        threadId: thread.id,
      });

      return thread.id;

    } catch (error) {
      logger.error('❌ Error obteniendo/creando thread:', error);
      throw error;
    }
  }

  /**
   * Espera a que el Assistant termine de procesar (polling)
   */
  async waitForRunCompletion(threadId, runId, maxWaitTime = 30000) {
    const startTime = Date.now();
    const pollInterval = 500; // ms

    logger.debug('🔍 waitForRunCompletion recibió', {
      threadId,
      runId,
      threadIdType: typeof threadId,
      runIdType: typeof runId,
    });

    while (Date.now() - startTime < maxWaitTime) {
      const run = await this.openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });

      logger.debug('🔄 Run status:', run.status);

      if (run.status === 'completed') {
        return run;
      }

      if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
        throw new Error(`Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
      }

      // Esperar antes de la siguiente verificación
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Run timeout después de ${maxWaitTime}ms`);
  }

  /**
   * Construye mensaje de contexto desde el Thinking Engine
   * (Opcional - solo si quieres pasar contexto adicional al Assistant)
   */
  buildContextFromThinking(analysis) {
    if (!analysis) return null;

    // Solo incluir información crítica como contexto adicional
    let context = '';

    // Contexto temporal crítico
    if (analysis.temporal?.isResumingAfterGap) {
      context += `[CONTEXTO: Usuario retoma conversación después de ${analysis.temporal.humanReadableGap}]\n`;
    }

    // Información detectada crítica
    if (analysis.shopify?.detected) {
      context += `[INFO: Usuario confirmó que usa Shopify]\n`;
    }

    if (analysis.pain?.level && analysis.pain.level !== 'none') {
      context += `[INFO: Usuario expresó frustración nivel ${analysis.pain.level}]\n`;
    }

    return context.length > 0 ? context : null;
  }

  /**
   * Elimina un thread (útil para testing o reset)
   */
  async deleteThread(threadId) {
    try {
      await this.openai.beta.threads.del(threadId);
      logger.info('🗑️ Thread eliminado', { threadId });
    } catch (error) {
      logger.error('❌ Error eliminando thread:', error);
      throw error;
    }
  }
}

module.exports = new AssistantService();
